import csv, io, json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Project, SensorReading, DosingJob, User
from app.auth import get_current_user

router = APIRouter(prefix="/exports", tags=["exports"])

@router.get("/{project_id}/csv")
def export_csv(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(404, "Project not found")

    output = io.StringIO()
    writer = csv.writer(output)

    if project.system_type == "multisensor":
        writer.writerow(["id", "parameter", "value", "unit", "source", "sample_id", "recorded_at"])
        rows = db.query(SensorReading).filter(SensorReading.project_id == project_id).all()
        for r in rows:
            writer.writerow([r.id, r.parameter, r.value, r.unit, r.source, r.sample_id, r.recorded_at])
    else:
        writer.writerow(["id", "source_name", "liquid", "volume_ml", "moles", "concentration", "processed_at"])
        rows = db.query(DosingJob).filter(DosingJob.project_id == project_id).all()
        for r in rows:
            writer.writerow([r.id, r.source_name, r.liquid, r.volume_ml, r.moles, r.concentration, r.processed_at])

    output.seek(0)
    filename = f"{project.name.replace(' ', '_')}.csv"
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.get("/{project_id}/json")
def export_json(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(404, "Project not found")

    if project.system_type == "multisensor":
        rows = db.query(SensorReading).filter(SensorReading.project_id == project_id).all()
        data = [{"parameter": r.parameter, "value": r.value, "unit": r.unit,
                 "source": r.source, "recorded_at": str(r.recorded_at)} for r in rows]
    else:
        rows = db.query(DosingJob).filter(DosingJob.project_id == project_id).all()
        data = [{"source_name": r.source_name, "liquid": r.liquid,
                 "volume_ml": r.volume_ml, "moles": r.moles,
                 "concentration": r.concentration, "processed_at": str(r.processed_at)} for r in rows]

    output = io.BytesIO(json.dumps({"project": project.name, "data": data}, indent=2).encode())
    filename = f"{project.name.replace(' ', '_')}.json"
    return StreamingResponse(
        output,
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )