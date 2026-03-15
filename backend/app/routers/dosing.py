import os, shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
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

# ── Create project ────────────────────────────────────────────────────────────
@router.post("/projects", response_model=ProjectOut)
def create_project(
    body: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
    return db.query(Project).filter(
        Project.user_id == current_user.id,
        Project.system_type == "dosing"
    ).all()

# ── Device control ────────────────────────────────────────────────────────────
@router.post("/{project_id}/trigger-capture")
def trigger_capture(
    project_id: str,
    cmd: DeviceCommand,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Tell ESP-CAM to take a photo and POST it to /dosing/{project_id}/capture.
    Sends MQTT command to the device.
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

# ── Image upload & processing ─────────────────────────────────────────────────
@router.post("/{project_id}/capture", response_model=DosingJobOut)
async def receive_capture(
    project_id:  str,
    source_name: str = Form(...),
    liquid:      str = Form(...),
    image:       UploadFile = File(...),
    db:          Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    ESP-CAM POSTs a JPEG image here.
    Saves image → runs CV processing → stores volume & moles in DB.

    ESP-CAM Arduino sketch should POST to:
      POST http://<server-ip>:8000/dosing/{project_id}/capture
      Headers: Authorization: Bearer <token>
      Body: multipart/form-data
        source_name = "Tank A"
        liquid      = "Chlorine"
        image       = <JPEG bytes>
    """
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id,
    ).first()
    if not project:
        raise HTTPException(404, "Project not found")

    # Save image to disk
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    safe_source = source_name.replace(" ", "_")
    filename = f"{project_id}_{safe_source}_{image.filename}"
    filepath = os.path.join(settings.UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        shutil.copyfileobj(image.file, f)

    # Process image
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
    return db.query(DosingJob).filter(
        DosingJob.project_id == project_id
    ).order_by(DosingJob.processed_at.desc()).all()