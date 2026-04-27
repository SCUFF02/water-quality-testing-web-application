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
    if current_user.role not in ("admin", "researcher"):
        q = q.filter(Project.user_id == current_user.id)
    p = q.first()
    if not p: raise HTTPException(404, "Project not found")
    return ProjectOut.from_orm_with_owner(p)

@router.patch("/projects/{project_id}", response_model=ProjectOut)
def rename_project(project_id: str, body: ProjectUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(Project).filter(Project.id == project_id)
    if current_user.role not in ("admin", "researcher"):
        q = q.filter(Project.user_id == current_user.id)
    p = q.first()
    if not p: raise HTTPException(404, "Project not found")
    exists = db.query(Project).filter(
        Project.user_id == p.user_id,
        Project.name == body.name,
        Project.id != project_id
    ).first()
    if exists: raise HTTPException(400, "This user already has a project with that name")
    p.name = body.name
    db.commit()
    db.refresh(p)
    return ProjectOut.from_orm_with_owner(p)

@router.delete("/projects/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(Project).filter(Project.id == project_id)
    if current_user.role not in ("admin", "researcher"):
        q = q.filter(Project.user_id == current_user.id)
    p = q.first()
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

# ESP32 — fetch project info + status on boot (API key only, no JWT)
@router.get("/{project_id}/info")
def get_project_info_device(project_id: str, x_api_key: str = Header(...), db: Session = Depends(get_db)):
    """ESP32 calls this on boot to get sample list and current status."""
    if x_api_key != settings.DEVICE_API_KEY:
        raise HTTPException(403, "Invalid device API key")
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p: raise HTTPException(404, "Project not found")
    return {
        "id":           p.id,
        "name":         p.name,
        "status":       p.status or "idle",
        "sample_count": len(p.samples),
        "samples": [
            {"id": s.id, "sample_name": s.sample_name, "region": s.region}
            for s in p.samples
        ]
    }

@router.patch("/{project_id}/readings/{reading_id}", response_model=ReadingOut)
def update_reading(project_id: str, reading_id: str, body: ReadingIn,
                   db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(SensorReading).join(Project).filter(SensorReading.id == reading_id)
    if current_user.role not in ("admin", "researcher"):
        q = q.filter(Project.user_id == current_user.id)
    reading = q.first()
    if not reading: raise HTTPException(404, "Reading not found")
    reading.parameter = body.parameter
    reading.value     = body.value
    reading.unit      = body.unit
    reading.source    = body.source
    db.commit()
    db.refresh(reading)
    return reading

@router.delete("/{project_id}/readings/{reading_id}")
def delete_reading(project_id: str, reading_id: str,
                   db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(SensorReading).join(Project).filter(SensorReading.id == reading_id)
    if current_user.role not in ("admin", "researcher"):
        q = q.filter(Project.user_id == current_user.id)
    reading = q.first()
    if not reading: raise HTTPException(404, "Reading not found")
    db.delete(reading); db.commit()
    return {"deleted": reading_id}

@router.post("/{project_id}/readings", response_model=ReadingOut)
def add_reading(project_id: str, body: ReadingIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(Project).filter(Project.id == project_id)
    if current_user.role not in ("admin", "researcher"):
        q = q.filter(Project.user_id == current_user.id)
    if not q.first():
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
    if current_user.role not in ("admin", "researcher"):
        q = q.filter(Project.user_id == current_user.id)
    if not q.first():
        raise HTTPException(404, "Project not found")
    q = db.query(SensorReading).filter(SensorReading.project_id == project_id).order_by(SensorReading.recorded_at)
    total = q.count()
    items = q.offset((page - 1) * per_page).limit(per_page).all()
    return {"total": total, "page": page, "per_page": per_page, "items": items}

@router.post("/{project_id}/samples")
def add_sample(
    project_id: str,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a new sample to an existing project."""
    q = db.query(Project).filter(Project.id == project_id)
    if current_user.role not in ("admin", "researcher"):
        q = q.filter(Project.user_id == current_user.id)
    if not q.first():
        raise HTTPException(404, "Project not found")
    sample = Sample(
        project_id  = project_id,
        sample_name = body.get("sample_name", ""),
        region      = body.get("region", ""),
    )
    db.add(sample)
    db.commit()
    db.refresh(sample)
    return {"id": sample.id, "sample_name": sample.sample_name, "region": sample.region}

@router.patch("/{project_id}/samples/{sample_id}")
def rename_sample(project_id: str, sample_id: str, body: dict,
                  db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(Sample).join(Project).filter(Sample.id == sample_id)
    if current_user.role not in ("admin", "researcher"):
        q = q.filter(Project.user_id == current_user.id)
    sample = q.first()
    if not sample: raise HTTPException(404, "Sample not found")
    if "sample_name" in body and body["sample_name"].strip():
        name = body["sample_name"].strip()
        if len(name) > 18:
            raise HTTPException(400, "Sample name must be 18 characters or fewer")
        sample.sample_name = name
    if "region" in body:
        region = body["region"]
        if len(region) > 25:
            raise HTTPException(400, "Region must be 25 characters or fewer")
        sample.region = region
    db.commit()
    db.refresh(sample)
    return {"id": sample.id, "sample_name": sample.sample_name, "region": sample.region}

@router.delete("/{project_id}/samples/{sample_id}")
def delete_sample(project_id: str, sample_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(Sample).join(Project).filter(Sample.id == sample_id)
    if current_user.role not in ("admin", "researcher"):
        q = q.filter(Project.user_id == current_user.id)
    sample = q.first()
    if not sample: raise HTTPException(404, "Sample not found")
    db.delete(sample); db.commit()
    return {"deleted": sample_id}

# ── Project status endpoints (ESP32 polls these) ──────────────────────────────

@router.get("/{project_id}/status")
def get_status(project_id: str, x_api_key: str = Header(...), db: Session = Depends(get_db)):
    """
    ESP32 polls this every 5 seconds.
    Returns {"status": "active"} or {"status": "idle"}.
    No JWT — uses device API key.
    """
    if x_api_key != settings.DEVICE_API_KEY:
        raise HTTPException(403, "Invalid device API key")
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    return {"status": p.status or "idle", "sample_count": len(p.samples)}


@router.post("/{project_id}/start")
def start_project(project_id: str, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    """User clicks Start — sets project status to active."""
    q = db.query(Project).filter(Project.id == project_id)
    if current_user.role not in ("admin", "researcher"):
        q = q.filter(Project.user_id == current_user.id)
    p = q.first()
    if not p:
        raise HTTPException(404, "Project not found")
    p.status = "active"
    db.commit()
    return {"status": "active"}


@router.post("/{project_id}/stop")
def stop_project(project_id: str, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)):
    """User clicks Stop — sets project status to idle."""
    q = db.query(Project).filter(Project.id == project_id)
    if current_user.role not in ("admin", "researcher"):
        q = q.filter(Project.user_id == current_user.id)
    p = q.first()
    if not p:
        raise HTTPException(404, "Project not found")
    p.status = "idle"
    db.commit()
    return {"status": "idle"}

@router.post("/{project_id}/stop-device")
def stop_project_device(project_id: str, x_api_key: str = Header(...), db: Session = Depends(get_db)):
    """ESP32 calls this after finishing all samples — no JWT needed."""
    if x_api_key != settings.DEVICE_API_KEY:
        raise HTTPException(403, "Invalid device API key")
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p: raise HTTPException(404, "Project not found")
    p.status = "idle"
    db.commit()
    return {"status": "idle"}