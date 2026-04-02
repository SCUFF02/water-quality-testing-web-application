from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import List
from app.db import get_db
from app.models import Project, SensorReading, Sample, User, SystemType
from app.schemas import ReadingIn, ReadingOut, ProjectCreate, ProjectOut
from app.auth import get_current_user
from app.settings import settings

router = APIRouter(prefix="/multisensor", tags=["multisensor"])

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
    p = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not p: raise HTTPException(404, "Project not found")
    return p

@router.delete("/projects/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not p: raise HTTPException(404, "Project not found")
    db.delete(p)
    db.commit()
    return {"deleted": project_id}

# ESP32 HTTP push — no MQTT needed
@router.post("/{project_id}/push")
def push_reading(project_id: str, body: ReadingIn, x_api_key: str = Header(...), db: Session = Depends(get_db)):
    """ESP32 POSTs sensor readings directly here. Header: X-Api-Key: esp-device-secret-key"""
    if x_api_key != settings.DEVICE_API_KEY:
        raise HTTPException(403, "Invalid device API key")
    if not db.query(Project).filter(Project.id == project_id).first():
        raise HTTPException(404, "Project not found")
    reading = SensorReading(project_id=project_id, sample_id=body.sample_id, parameter=body.parameter, value=body.value, unit=body.unit, source="device")
    db.add(reading)
    db.commit()
    return {"status": "saved", "id": reading.id}

@router.post("/{project_id}/readings", response_model=ReadingOut)
def add_reading(project_id: str, body: ReadingIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first():
        raise HTTPException(404, "Project not found")
    reading = SensorReading(project_id=project_id, sample_id=body.sample_id, parameter=body.parameter, value=body.value, unit=body.unit, source=body.source)
    db.add(reading)
    db.commit()
    db.refresh(reading)
    return reading

@router.get("/{project_id}/readings", response_model=List[ReadingOut])
def get_readings(project_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first():
        raise HTTPException(404, "Project not found")
    return db.query(SensorReading).filter(SensorReading.project_id == project_id).order_by(SensorReading.recorded_at).all()

@router.delete("/{project_id}/samples/{sample_id}")
def delete_sample(project_id: str, sample_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sample = db.query(Sample).join(Project).filter(Sample.id == sample_id, Project.user_id == current_user.id).first()
    if not sample: raise HTTPException(404, "Sample not found")
    db.delete(sample)
    db.commit()
    return {"deleted": sample_id}