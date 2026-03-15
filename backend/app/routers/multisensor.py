from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.db import get_db
from app.models import Project, SensorReading, Sample, User
from app.schemas import ReadingIn, ReadingOut, ProjectCreate, ProjectOut, DeviceCommand
from app.auth import get_current_user
from app.mqtt_client import mqtt_client
from app.settings import settings

router = APIRouter(prefix="/multisensor", tags=["multisensor"])

# ── Create project ─────────────────────────────────────────────────────────────
@router.post("/projects", response_model=ProjectOut)
def create_project(
    body: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Creates a new MultiSensor project in the database.
    Called by MultiSensorForm after saving to localStorage.
    """
    from app.models import SystemType
    project = Project(
        name        = body.name,
        system_type = SystemType.multisensor,
        user_id     = current_user.id,
        manual_only = body.manual_only,
    )
    db.add(project)
    db.flush()  # get the project ID before committing
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
    """Returns all MultiSensor projects for the logged-in user."""
    return db.query(Project).filter(
        Project.user_id == current_user.id,
        Project.system_type == "multisensor"
    ).all()

# ── Device control ─────────────────────────────────────────────────────────────
@router.post("/{project_id}/start")
def start_collecting(
    project_id: str,
    cmd: DeviceCommand,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Sends a START command to the ESP32 via MQTT.
    The ESP32 receives this and begins sending sensor readings.
    Called when user clicks 'Start collecting data'.
    """
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(404, "Project not found")
    topic = settings.MQTT_TOPIC_COMMAND.format(device_id=project_id)
    mqtt_client.publish(topic, {
        "action":      "start",
        "project_id":  project_id,
        "interval_ms": cmd.interval_ms,
    })
    return {"status": "command_sent", "action": "start"}

@router.post("/{project_id}/stop")
def stop_collecting(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Sends a STOP command to the ESP32 via MQTT.
    The ESP32 receives this and stops sending readings.
    """
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(404, "Project not found")
    topic = settings.MQTT_TOPIC_COMMAND.format(device_id=project_id)
    mqtt_client.publish(topic, {"action": "stop", "project_id": project_id})
    return {"status": "command_sent", "action": "stop"}

# ── Readings ───────────────────────────────────────────────────────────────────
@router.post("/{project_id}/readings", response_model=ReadingOut)
def add_reading(
    project_id: str,
    body: ReadingIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Saves one sensor reading manually.
    Also used internally by the MQTT handler when the ESP32 sends data.
    """
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns all sensor readings for a project, ordered by time."""
    return db.query(SensorReading).filter(
        SensorReading.project_id == project_id
    ).order_by(SensorReading.recorded_at).all()

# ── Delete sample ──────────────────────────────────────────────────────────────
@router.delete("/{project_id}/samples/{sample_id}")
def delete_sample(
    project_id: str,
    sample_id:  str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Deletes a sample and all its readings from the database.
    Called when user deletes a sample in ProjectDataPage.
    """
    sample = db.query(Sample).join(Project).filter(
        Sample.id == sample_id,
        Project.user_id == current_user.id,
    ).first()
    if not sample:
        raise HTTPException(404, "Sample not found")
    db.delete(sample)
    db.commit()
    return {"deleted": sample_id}