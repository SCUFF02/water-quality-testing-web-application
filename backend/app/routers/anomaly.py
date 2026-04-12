from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.db import get_db
from app.models import Project, SensorReading, Sample, User
from app.auth import get_current_user
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from app.anomaly import detect_anomalies

router = APIRouter(prefix="/anomaly", tags=["anomaly"])

@router.get("/{project_id}")
def get_anomalies(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Run anomaly detection on all readings for a project.
    Returns list of {severity, parameter, sample, message}.
    Accessible by owner, admin, and researcher.
    """
    q = db.query(Project).filter(Project.id == project_id)
    if current_user.role not in ("admin", "researcher"):
        q = q.filter(Project.user_id == current_user.id)
    project = q.first()
    if not project:
        raise HTTPException(404, "Project not found")

    readings = db.query(SensorReading).filter(
        SensorReading.project_id == project_id
    ).all()

    if not readings:
        return []

    # Build sample name lookup
    samples = {s.id: s for s in db.query(Sample).filter(Sample.project_id == project_id).all()}

    data = []
    for r in readings:
        sample = samples.get(r.sample_id)
        data.append({
            "parameter":   r.parameter,
            "value":       r.value,
            "sampleName":  sample.sample_name if sample else "Unknown",
            "recorded_at": str(r.recorded_at),
        })

    return detect_anomalies(data)
