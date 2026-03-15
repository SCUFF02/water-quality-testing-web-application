import os, shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Header
from sqlalchemy.orm import Session
from typing import List
from app.db import get_db
from app.models import Project, DosingJob, User
from app.schemas import DosingJobOut, ProjectCreate, ProjectOut, DeviceCommand
from app.auth import get_current_user
from app.image_processing.processor import process_dosing_image
from app.mqtt_client import mqtt_client
from app.settings import settings

router = APIRouter(prefix="/dosing", tags=["dosing"])

# ── Create project ─────────────────────────────────────────────────────────────
@router.post("/projects", response_model=ProjectOut)
def create_project(
    body: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Creates a new Dosing project. Called by DosingSystemForm."""
    from app.models import SystemType, Sample
    project = Project(
        name        = body.name,
        system_type = SystemType.dosing,
        user_id     = current_user.id,
        manual_only = body.manual_only,
    )
    db.add(project)
    db.flush()
    for s in body.samples:
        db.add(Sample(project_id=project.id, sample_name=s.sample_name, region=s.region))
    db.commit()
    db.refresh(project)
    return project

@router.get("/projects", response_model=List[ProjectOut])
def list_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns all Dosing projects for the logged-in user."""
    return db.query(Project).filter(
        Project.user_id == current_user.id,
        Project.system_type == "dosing"
    ).all()

# ── Tell ESP-CAM to take a photo ───────────────────────────────────────────────
@router.post("/{project_id}/trigger-capture")
def trigger_capture(
    project_id: str,
    cmd: DeviceCommand,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Sends a CAPTURE command to the ESP-CAM via MQTT.
    The ESP-CAM receives this, takes a photo, and POSTs it to /capture-device.
    Called when user clicks 'Start collecting data' on a dosing project.
    """
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(404, "Project not found")
    topic = settings.MQTT_TOPIC_COMMAND.format(device_id=project_id)
    mqtt_client.publish(topic, {"action": "capture", "project_id": project_id})
    return {"status": "command_sent", "action": "capture"}

# ── Receive image from ESP-CAM (uses API key, not JWT) ─────────────────────────
@router.post("/{project_id}/capture-device", response_model=DosingJobOut)
async def receive_capture_from_device(
    project_id:  str,
    source_name: str = Form(...),
    liquid:      str = Form(...),
    image:       UploadFile = File(...),
    x_api_key:   str = Header(...),
    db:          Session = Depends(get_db),
):
    """
    This endpoint is for the ESP-CAM only — it uses an API key header instead of JWT
    because microcontrollers can't easily manage JWT tokens.

    In your ESP-CAM Arduino sketch, set:
      - URL: http://<your-pc-ip>:8000/dosing/{project_id}/capture-device
      - Header: X-Api-Key: esp-device-secret-key  (must match DEVICE_API_KEY in settings)
      - Body: multipart/form-data with source_name, liquid, and image fields
    """
    if x_api_key != settings.DEVICE_API_KEY:
        raise HTTPException(403, "Invalid device API key")
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    filename = f"{project_id}_{source_name.replace(' ', '_')}_{image.filename}"
    filepath = os.path.join(settings.UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        shutil.copyfileobj(image.file, f)

    result = process_dosing_image(filepath, liquid)

    job = DosingJob(
        project_id    = project_id,
        source_name   = source_name,
        image_path    = filepath,
        liquid        = liquid,
        volume_ml     = result.get("volume_ml"),
        moles         = result.get("moles"),
        concentration = result.get("concentration"),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job

# ── Receive image from frontend (uses JWT, for testing) ───────────────────────
@router.post("/{project_id}/capture", response_model=DosingJobOut)
async def receive_capture(
    project_id:  str,
    source_name: str = Form(...),
    liquid:      str = Form(...),
    image:       UploadFile = File(...),
    db:          Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Same as capture-device but uses JWT. Use this to test from the browser."""
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id,
    ).first()
    if not project:
        raise HTTPException(404, "Project not found")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    filename = f"{project_id}_{source_name.replace(' ', '_')}_{image.filename}"
    filepath = os.path.join(settings.UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        shutil.copyfileobj(image.file, f)

    result = process_dosing_image(filepath, liquid)

    job = DosingJob(
        project_id    = project_id,
        source_name   = source_name,
        image_path    = filepath,
        liquid        = liquid,
        volume_ml     = result.get("volume_ml"),
        moles         = result.get("moles"),
        concentration = result.get("concentration"),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job

@router.get("/{project_id}/jobs", response_model=List[DosingJobOut])
def get_jobs(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns all dosing capture jobs for a project, newest first."""
    return db.query(DosingJob).filter(
        DosingJob.project_id == project_id
    ).order_by(DosingJob.processed_at.desc()).all()