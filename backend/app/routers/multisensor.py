from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import List
from app.db import get_db
from app.models import Project, SensorReading, Sample, User, SystemType
from app.schemas import ReadingIn, ReadingOut, ProjectCreate, ProjectOut
from app.auth import get_current_user
from app.settings import settings

router = APIRouter(prefix="/multisensor", tags=["multisensor"])

# ── Create project ─────────────────────────────────────────────────────────────
@router.post("/projects", response_model=ProjectOut)
def create_project(
    body: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = Project(
        name        = body.name,
        system_type = SystemType.multisensor,
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
        Project.user_id     == current_user.id,
        Project.system_type == "multisensor"
    ).all()

# ── ESP32 HTTP push — no MQTT needed ──────────────────────────────────────────
@router.post("/{project_id}/push")
def push_reading(
    project_id: str,
    body:       ReadingIn,
    x_api_key:  str = Header(..., description="Must match DEVICE_API_KEY in settings"),
    db:         Session = Depends(get_db),
):
    """
    Called directly by the ESP32 via HTTP POST.
    No MQTT broker needed — ESP32 sends data straight to this endpoint.

    ESP32 Arduino code:
        http.addHeader("X-Api-Key", "esp-device-secret-key");
        POST to: http://{SERVER_IP}:8000/multisensor/{project_id}/push
        Body: { "parameter": "pH", "value": 7.2, "unit": "" }
    """
    if x_api_key != settings.DEVICE_API_KEY:
        raise HTTPException(403, "Invalid device API key")
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    reading = SensorReading(
        project_id = project_id,
        sample_id  = body.sample_id,
        parameter  = body.parameter,
        value      = body.value,
        unit       = body.unit,
        source     = "device",
    )
    db.add(reading)
    db.commit()
    db.refresh(reading)
    return {"status": "saved", "id": reading.id}

# ── Manual readings (from frontend) ───────────────────────────────────────────
@router.post("/{project_id}/readings", response_model=ReadingOut)
def add_reading(
    project_id: str,
    body:       ReadingIn,
    db:         Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not db.query(Project).filter(Project.id == project_id).first():
        raise HTTPException(404, "Project not found")
    reading = SensorReading(
        project_id = project_id,
        sample_id  = body.sample_id,
        parameter  = body.parameter,
        value      = body.value,
        unit       = body.unit,
        source     = body.source,
    )
    db.add(reading)
    db.commit()
    db.refresh(reading)
    return reading

@router.get("/{project_id}/readings", response_model=List[ReadingOut])
def get_readings(
    project_id: str,
    db:         Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(SensorReading).filter(
        SensorReading.project_id == project_id
    ).order_by(SensorReading.recorded_at).all()

# ── Delete sample ──────────────────────────────────────────────────────────────
@router.delete("/{project_id}/samples/{sample_id}")
def delete_sample(
    project_id:  str,
    sample_id:   str,
    db:          Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sample = db.query(Sample).join(Project).filter(
        Sample.id         == sample_id,
        Project.user_id   == current_user.id,
    ).first()
    if not sample:
        raise HTTPException(404, "Sample not found")
    db.delete(sample)
    db.commit()
    return {"deleted": sample_id}