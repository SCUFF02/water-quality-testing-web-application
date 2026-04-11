from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field
from app.db import get_db
from app.models import Project, SensorReading, Sample, User, SystemType
from app.schemas import ReadingIn, ReadingOut, ProjectCreate, ProjectOut
from app.auth import get_current_user
from app.settings import settings

router = APIRouter(prefix="/multisensor", tags=["multisensor"])

class ProjectUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)

class PaginatedReadings(BaseModel):
    total:    int
    page:     int
    per_page: int
    items:    List[ReadingOut]
    class Config: from_attributes = True

@router.post("/projects", response_model=ProjectOut)
def create_project(body: ProjectCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = Project(name=body.name, system_type=SystemType.multisensor, user_id=current_user.id, manual_only=body.manual_only)
    db.add(project)
    db.flush()
    for s in body.samples:
        db.add(Sample(project_id=project.id, sample_name=s.sample_name, region=s.region))
    db.commit()
    db.refresh(project)
    return project

@router.get("/projects", response_model=List[ProjectOut])
def list_projects(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Project).filter(Project.user_id == current_user.id, Project.system_type == "multisensor").all()

@router.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(project_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(Project).filter(Project.id == project_id)
    if current_user.role != "admin":
        q = q.filter(Project.user_id == current_user.id)
    p = q.first()
    if not p: raise HTTPException(404, "Project not found")
    return p

@router.patch("/projects/{project_id}", response_model=ProjectOut)
def rename_project(project_id: str, body: ProjectUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Rename a project. Only the owner can rename."""
    p = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not p: raise HTTPException(404, "Project not found")
    # Check new name not taken by same user
    exists = db.query(Project).filter(
        Project.user_id == current_user.id,
        Project.name == body.name,
        Project.id != project_id
    ).first()
    if exists: raise HTTPException(400, "You already have a project with that name")
    p.name = body.name
    db.commit()
    db.refresh(p)
    return p

@router.delete("/projects/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not p: raise HTTPException(404, "Project not found")
    db.delete(p)
    db.commit()
    return {"deleted": project_id}

# ESP32 HTTP push
@router.post("/{project_id}/push")
def push_reading(project_id: str, body: ReadingIn, x_api_key: str = Header(...), db: Session = Depends(get_db)):
    if x_api_key != settings.DEVICE_API_KEY: raise HTTPException(403, "Invalid device API key")
    if not db.query(Project).filter(Project.id == project_id).first(): raise HTTPException(404, "Project not found")
    reading = SensorReading(project_id=project_id, sample_id=body.sample_id, parameter=body.parameter, value=body.value, unit=body.unit, source="device")
    db.add(reading); db.commit()
    return {"status": "saved", "id": reading.id}

@router.post("/{project_id}/readings", response_model=ReadingOut)
def add_reading(project_id: str, body: ReadingIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first():
        raise HTTPException(404, "Project not found")
    reading = SensorReading(project_id=project_id, sample_id=body.sample_id, parameter=body.parameter, value=body.value, unit=body.unit, source=body.source)
    db.add(reading); db.commit(); db.refresh(reading)
    return reading

@router.get("/{project_id}/readings")
def get_readings(
    project_id: str,
    page:     int = Query(1,   ge=1,  description="Page number"),
    per_page: int = Query(100, ge=1, le=500, description="Results per page (max 500)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Paginated readings. Use ?page=1&per_page=100"""
    q = db.query(Project).filter(Project.id == project_id)
    if current_user.role != "admin":
        q = q.filter(Project.user_id == current_user.id)
    if not q.first():
        raise HTTPException(404, "Project not found")
    q = db.query(SensorReading).filter(SensorReading.project_id == project_id).order_by(SensorReading.recorded_at)
    total = q.count()
    items = q.offset((page - 1) * per_page).limit(per_page).all()
    return {"total": total, "page": page, "per_page": per_page, "items": items}

@router.delete("/{project_id}/samples/{sample_id}")
def delete_sample(project_id: str, sample_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sample = db.query(Sample).join(Project).filter(Sample.id == sample_id, Project.user_id == current_user.id).first()
    if not sample: raise HTTPException(404, "Sample not found")
    db.delete(sample); db.commit()
    return {"deleted": sample_id}