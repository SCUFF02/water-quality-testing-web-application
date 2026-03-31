import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Header
from sqlalchemy.orm import Session
from typing import List
from app.db import get_db
from app.models import Project, DosingJob, User, SystemType, Sample
from app.schemas import DosingJobOut, ProjectCreate, ProjectOut
from app.auth import get_current_user
from app.image_processing.processor import process_dosing_image
from app.settings import settings

router = APIRouter(prefix="/dosing", tags=["dosing"])

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png"}
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB

# ── Create project ─────────────────────────────────────────────────────────────
@router.post("/projects", response_model=ProjectOut)
def create_project(
    body: ProjectCreate,
    db:   Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
    db:   Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Project).filter(
        Project.user_id     == current_user.id,
        Project.system_type == "dosing"
    ).all()

# ── Receive image from ESP-CAM (API key auth) ──────────────────────────────────
@router.post("/{project_id}/capture-device", response_model=DosingJobOut)
async def receive_capture_from_device(
    project_id:  str,
    source_name: str        = Form(...),
    liquid:      str        = Form(...),
    image:       UploadFile = File(...),
    x_api_key:   str        = Header(...),
    db:          Session    = Depends(get_db),
):
    """
    For ESP-CAM only — authenticated via API key header.

    ESP-CAM Arduino sketch:
        URL:    http://{SERVER_IP}:8000/dosing/{project_id}/capture-device
        Header: X-Api-Key: esp-device-secret-key
        Body:   multipart/form-data with source_name, liquid, image
    """
    # 1. Validate API key
    if x_api_key != settings.DEVICE_API_KEY:
        raise HTTPException(403, "Invalid device API key")

    # 2. Validate project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    # 3. Validate image type
    if image.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(400, "Only JPEG and PNG images are allowed")

    # 4. Validate image size (read into memory first)
    contents = await image.read()
    if len(contents) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(400, "Image too large — maximum is 5 MB")

    # 5. Save image to disk
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    safe_source = source_name.replace(" ", "_").replace("/", "_")[:50]
    filename    = f"{project_id}_{safe_source}_{image.filename}"
    filepath    = os.path.join(settings.UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(contents)

    # 6. Run OpenCV pipeline
    result = process_dosing_image(filepath, liquid)

    # 7. Save result
    job = DosingJob(
        project_id    = project_id,
        source_name   = source_name[:120],
        image_path    = filepath,
        liquid        = liquid[:80],
        volume_ml     = result.get("volume_ml"),
        moles         = result.get("moles"),
        concentration = result.get("concentration"),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job

# ── Receive image from frontend (JWT auth, for testing) ───────────────────────
@router.post("/{project_id}/capture", response_model=DosingJobOut)
async def receive_capture(
    project_id:  str,
    source_name: str        = Form(...),
    liquid:      str        = Form(...),
    image:       UploadFile = File(...),
    db:          Session    = Depends(get_db),
    current_user: User      = Depends(get_current_user),
):
    """Same as capture-device but uses JWT. For browser testing via /docs."""
    project = db.query(Project).filter(
        Project.id      == project_id,
        Project.user_id == current_user.id,
    ).first()
    if not project:
        raise HTTPException(404, "Project not found")

    if image.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(400, "Only JPEG and PNG images are allowed")

    contents = await image.read()
    if len(contents) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(400, "Image too large — maximum is 5 MB")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    safe_source = source_name.replace(" ", "_").replace("/", "_")[:50]
    filename    = f"{project_id}_{safe_source}_{image.filename}"
    filepath    = os.path.join(settings.UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(contents)

    result = process_dosing_image(filepath, liquid)

    job = DosingJob(
        project_id    = project_id,
        source_name   = source_name[:120],
        image_path    = filepath,
        liquid        = liquid[:80],
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
    db:         Session = Depends(get_db),
    current_user: User  = Depends(get_current_user),
):
    return db.query(DosingJob).filter(
        DosingJob.project_id == project_id
    ).order_by(DosingJob.processed_at.desc()).all()