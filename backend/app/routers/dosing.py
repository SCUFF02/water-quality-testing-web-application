import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Header, Query
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel, Field
from app.db import get_db
from app.models import Project, DosingJob, User, SystemType, Sample
from app.schemas import DosingJobOut, ProjectCreate, ProjectOut
from app.auth import get_current_user
from app.image_processing.processor import process_dosing_image
from app.settings import settings

router = APIRouter(prefix="/dosing", tags=["dosing"])

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png"}
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

class ProjectUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)

@router.post("/projects", response_model=ProjectOut)
def create_project(body: ProjectCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = Project(name=body.name, system_type=SystemType.dosing, user_id=current_user.id, manual_only=body.manual_only)
    db.add(project); db.flush()
    for s in body.samples:
        db.add(Sample(project_id=project.id, sample_name=s.sample_name, region=s.region))
    db.commit(); db.refresh(project)
    return project

@router.get("/projects", response_model=List[ProjectOut])
def list_projects(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Project).filter(Project.user_id == current_user.id, Project.system_type == "dosing").all()

@router.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(project_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not p: raise HTTPException(404, "Project not found")
    return p

@router.patch("/projects/{project_id}", response_model=ProjectOut)
def rename_project(project_id: str, body: ProjectUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Rename a dosing project."""
    p = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not p: raise HTTPException(404, "Project not found")
    exists = db.query(Project).filter(Project.user_id == current_user.id, Project.name == body.name, Project.id != project_id).first()
    if exists: raise HTTPException(400, "You already have a project with that name")
    p.name = body.name; db.commit(); db.refresh(p)
    return p

@router.delete("/projects/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not p: raise HTTPException(404, "Project not found")
    db.delete(p); db.commit()
    return {"deleted": project_id}

@router.post("/{project_id}/capture-device", response_model=DosingJobOut)
async def receive_capture_from_device(project_id: str, source_name: str = Form(...), liquid: str = Form(...),
    image: UploadFile = File(...), x_api_key: str = Header(...), db: Session = Depends(get_db)):
    if x_api_key != settings.DEVICE_API_KEY: raise HTTPException(403, "Invalid device API key")
    if not db.query(Project).filter(Project.id == project_id).first(): raise HTTPException(404, "Project not found")
    if image.content_type not in ALLOWED_IMAGE_TYPES: raise HTTPException(400, "Only JPEG and PNG images allowed")
    contents = await image.read()
    if len(contents) > MAX_IMAGE_SIZE_BYTES: raise HTTPException(400, "Image too large — max 5MB")
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    safe_source = source_name.replace(" ", "_").replace("/", "_")[:50]
    filepath = os.path.join(settings.UPLOAD_DIR, f"{project_id}_{safe_source}_{image.filename}")
    with open(filepath, "wb") as f: f.write(contents)
    result = process_dosing_image(filepath, liquid)
    job = DosingJob(project_id=project_id, source_name=source_name[:120], image_path=filepath,
        liquid=liquid[:80], volume_ml=result.get("volume_ml"), moles=result.get("moles"), concentration=result.get("concentration"))
    db.add(job); db.commit(); db.refresh(job)
    return job

@router.post("/{project_id}/capture", response_model=DosingJobOut)
async def receive_capture(project_id: str, source_name: str = Form(...), liquid: str = Form(...),
    image: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first():
        raise HTTPException(404, "Project not found")
    if image.content_type not in ALLOWED_IMAGE_TYPES: raise HTTPException(400, "Only JPEG and PNG images allowed")
    contents = await image.read()
    if len(contents) > MAX_IMAGE_SIZE_BYTES: raise HTTPException(400, "Image too large — max 5MB")
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    safe_source = source_name.replace(" ", "_").replace("/", "_")[:50]
    filepath = os.path.join(settings.UPLOAD_DIR, f"{project_id}_{safe_source}_{image.filename}")
    with open(filepath, "wb") as f: f.write(contents)
    result = process_dosing_image(filepath, liquid)
    job = DosingJob(project_id=project_id, source_name=source_name[:120], image_path=filepath,
        liquid=liquid[:80], volume_ml=result.get("volume_ml"), moles=result.get("moles"), concentration=result.get("concentration"))
    db.add(job); db.commit(); db.refresh(job)
    return job

@router.get("/{project_id}/jobs")
def get_jobs(
    project_id: str,
    page:     int = Query(1,  ge=1,  description="Page number"),
    per_page: int = Query(50, ge=1, le=200, description="Results per page (max 200)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Paginated dosing jobs. Use ?page=1&per_page=50"""
    if not db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first():
        raise HTTPException(404, "Project not found")
    q = db.query(DosingJob).filter(DosingJob.project_id == project_id).order_by(DosingJob.processed_at.desc())
    total = q.count()
    items = q.offset((page - 1) * per_page).limit(per_page).all()
    return {"total": total, "page": page, "per_page": per_page, "items": items}