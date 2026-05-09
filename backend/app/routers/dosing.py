import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Header, Query
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel, Field
from app.db import get_db
from app.models import Project, DosingJob, User, SystemType, Sample
from app.schemas import DosingJobOut, ProjectCreate, ProjectOut
from app.auth import get_current_user
from app.image_processing.processor import process_dosing_image, process_dosing_pair, process_syringe_pair
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
    q = db.query(Project).filter(Project.id == project_id)
    if current_user.role not in ("admin", "researcher"):
        q = q.filter(Project.user_id == current_user.id)
    p = q.first()
    if not p: raise HTTPException(404, "Project not found")
    return ProjectOut.from_orm_with_owner(p)

@router.patch("/projects/{project_id}", response_model=ProjectOut)
def rename_project(project_id: str, body: ProjectUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Rename a dosing project."""
    q = db.query(Project).filter(Project.id == project_id)
    if current_user.role not in ("admin", "researcher"):
        q = q.filter(Project.user_id == current_user.id)
    p = q.first()
    if not p: raise HTTPException(404, "Project not found")
    exists = db.query(Project).filter(Project.user_id == p.user_id, Project.name == body.name, Project.id != project_id).first()
    if exists: raise HTTPException(400, "This user already has a project with that name")
    p.name = body.name; db.commit(); db.refresh(p)
    return ProjectOut.from_orm_with_owner(p)

@router.delete("/projects/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(Project).filter(Project.id == project_id)
    if current_user.role not in ("admin", "researcher"):
        q = q.filter(Project.user_id == current_user.id)
    p = q.first()
    if not p: raise HTTPException(404, "Project not found")
    db.delete(p); db.commit()
    return {"deleted": project_id}

@router.patch("/{project_id}/camera-ip")
def set_camera_ip(project_id: str, body: dict,
                  db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(Project).filter(Project.id == project_id)
    if current_user.role not in ("admin", "researcher"):
        q = q.filter(Project.user_id == current_user.id)
    p = q.first()
    if not p: raise HTTPException(404, "Project not found")
    p.camera_ip = body.get("camera_ip", "").strip() or None
    db.commit()
    return {"camera_ip": p.camera_ip}

@router.post("/{project_id}/capture-device")
async def receive_capture_from_device(
    project_id: str,
    image: UploadFile = File(...),
    x_api_key: str = Header(...),
    db: Session = Depends(get_db)
):
    if x_api_key != settings.DEVICE_API_KEY: raise HTTPException(403, "Invalid device API key")
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project: raise HTTPException(404, "Project not found")
    if image.content_type not in ALLOWED_IMAGE_TYPES: raise HTTPException(400, "Only JPEG and PNG images allowed")
    contents = await image.read()
    if len(contents) > MAX_IMAGE_SIZE_BYTES: raise HTTPException(400, "Image too large — max 5MB")

    samples = sorted(project.samples, key=lambda s: s.sample_name)
    total_samples = len(samples)

    # Count completed jobs (both before+after processed)
    completed_jobs = db.query(DosingJob).filter(
        DosingJob.project_id == project_id,
        DosingJob.image_path_after.isnot(None),
        DosingJob.image_path_after != ""
    ).count()

    # Check if all samples are done
    if total_samples > 0 and completed_jobs >= total_samples:
        project.status = "idle"
        db.commit()
        return {"done": True, "message": "All samples captured. Stopping."}

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    # Check if there's a pending job waiting for its "after" image
    pending_job = db.query(DosingJob).filter(
        DosingJob.project_id == project_id,
        (DosingJob.image_path_after == None) | (DosingJob.image_path_after == "")
    ).order_by(DosingJob.processed_at).first()

    if pending_job is None:
        # This is a BEFORE image — create a new job
        current_sample = samples[completed_jobs] if samples else None
        source_name = current_sample.sample_name if current_sample else f"sample_{completed_jobs + 1}"
        liquid = current_sample.region or "unknown" if current_sample else "unknown"

        filepath = os.path.join(settings.UPLOAD_DIR, f"{project_id}_{source_name}_before_{completed_jobs + 1}_{int(__import__('time').time())}.jpg")
        with open(filepath, "wb") as f: f.write(contents)

        job = DosingJob(
            project_id  = project_id,
            source_name = source_name[:120],
            image_path  = filepath,
            liquid      = liquid[:80],
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        return {
            "done":        False,
            "phase":       "before",
            "sample":      source_name,
            "captured":    completed_jobs,
            "total":       total_samples,
            "message":     f"Before image saved for {source_name}. Send after image when dosing is complete.",
        }

    else:
        # This is an AFTER image — complete the pending job
        source_name = pending_job.source_name
        filepath = os.path.join(settings.UPLOAD_DIR, f"{project_id}_{source_name}_after_{completed_jobs + 1}_{int(__import__('time').time())}.jpg")
        with open(filepath, "wb") as f: f.write(contents)

        # Use syringe piston detection to calculate dispensed volume
        result = process_syringe_pair(pending_job.image_path, filepath, pending_job.liquid)

        pending_job.image_path_after = filepath
        pending_job.volume_ml        = result.get("volume_ml")
        pending_job.moles            = result.get("moles")
        pending_job.concentration    = result.get("concentration")

        new_completed = completed_jobs + 1
        done = total_samples > 0 and new_completed >= total_samples
        if done:
            project.status = "idle"

        db.commit()

        return {
            "done":          done,
            "phase":         "after",
            "sample":        source_name,
            "captured":      new_completed,
            "total":         total_samples,
            "remaining":     max(0, total_samples - new_completed),
            "volume_ml":     pending_job.volume_ml,
            "moles":         pending_job.moles,
            "concentration": pending_job.concentration,
        }

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

@router.patch("/{project_id}/jobs/{job_id}", response_model=DosingJobOut)
def update_job(project_id: str, job_id: str, body: dict,
               db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    job = db.query(DosingJob).join(Project).filter(DosingJob.id == job_id)
    if current_user.role not in ("admin", "researcher"):
        job = job.filter(Project.user_id == current_user.id)
    job = job.first()
    if not job: raise HTTPException(404, "Job not found")
    if "volume_ml" in body and body["volume_ml"] is not None:
        job.volume_ml = float(body["volume_ml"])
        # Recalculate moles from new volume
        from app.image_processing.processor import LIQUID_PROPERTIES
        props = LIQUID_PROPERTIES.get(job.liquid, {"concentration": 0.1})
        job.moles = props["concentration"] * (job.volume_ml / 1000.0)
    if "source_name" in body: job.source_name = body["source_name"]
    db.commit(); db.refresh(job)
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
    proj_q = db.query(Project).filter(Project.id == project_id)
    if current_user.role not in ("admin", "researcher"):
        proj_q = proj_q.filter(Project.user_id == current_user.id)
    if not proj_q.first():
        raise HTTPException(404, "Project not found")
    q = db.query(DosingJob).filter(DosingJob.project_id == project_id).order_by(DosingJob.processed_at.desc())
    total = q.count()
    items = q.offset((page - 1) * per_page).limit(per_page).all()
    return {"total": total, "page": page, "per_page": per_page, "items": items}

# ── ESP32 endpoints (no JWT, use API key) ─────────────────────────────────────

@router.get("/active-project")
def get_active_project(x_api_key: str = Header(...), db: Session = Depends(get_db)):
    """ESP32 polls this to find an active dosing project."""
    if x_api_key != settings.DEVICE_API_KEY:
        raise HTTPException(403, "Invalid device API key")
    
    # Find first project with status="active" and system_type="dosing"
    project = db.query(Project).filter(
        Project.system_type == "dosing",
        Project.status == "active"
    ).first()
    
    if not project:
        raise HTTPException(404, "No active dosing project")
    
    return {
        "id": project.id,
        "name": project.name,
        "sample_count": len(project.samples),
        "samples": [
            {"id": s.id, "sample_name": s.sample_name, "region": s.region}
            for s in project.samples
        ]
    }

@router.post("/{project_id}/stop-device")
def stop_project_device(project_id: str, x_api_key: str = Header(...), db: Session = Depends(get_db)):
    """ESP32 calls this after finishing all samples — no JWT needed."""
    if x_api_key != settings.DEVICE_API_KEY:
        raise HTTPException(403, "Invalid device API key")
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    p.status = "idle"
    db.commit()
    return {"status": "idle"}