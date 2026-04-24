from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.db import get_db
from app.models import MergedProject, Project, User
from app.schemas import MergedProjectCreate, MergedProjectRename, MergedProjectOut
from app.auth import get_current_user

router = APIRouter(prefix="/merged", tags=["merged"])

@router.post("/projects", response_model=MergedProjectOut)
def create_merged(body: MergedProjectCreate, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    # Verify both projects exist and are accessible
    def get_proj(pid: str):
        q = db.query(Project).filter(Project.id == pid)
        if current_user.role not in ("admin", "researcher"):
            q = q.filter(Project.user_id == current_user.id)
        p = q.first()
        if not p: raise HTTPException(404, f"Project {pid} not found")
        return p

    get_proj(body.project_a_id)
    get_proj(body.project_b_id)

    if body.project_a_id == body.project_b_id:
        raise HTTPException(400, "Cannot merge a project with itself")

    # Check name not taken
    exists = db.query(MergedProject).filter(
        MergedProject.user_id == current_user.id,
        MergedProject.name == body.name
    ).first()
    if exists: raise HTTPException(400, "You already have a merged project with that name")

    merged = MergedProject(
        user_id      = current_user.id,
        name         = body.name,
        project_a_id = body.project_a_id,
        project_b_id = body.project_b_id,
    )
    db.add(merged)
    db.commit()
    db.refresh(merged)
    return merged

@router.get("/projects", response_model=List[MergedProjectOut])
def list_merged(db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    return db.query(MergedProject).filter(
        MergedProject.user_id == current_user.id
    ).all()

@router.get("/projects/{merged_id}", response_model=MergedProjectOut)
def get_merged(merged_id: str, db: Session = Depends(get_db),
               current_user: User = Depends(get_current_user)):
    q = db.query(MergedProject).filter(MergedProject.id == merged_id)
    if current_user.role not in ("admin", "researcher"):
        q = q.filter(MergedProject.user_id == current_user.id)
    m = q.first()
    if not m: raise HTTPException(404, "Merged project not found")
    return MergedProjectOut.from_orm_with_owner(m)

@router.patch("/projects/{merged_id}", response_model=MergedProjectOut)
def rename_merged(merged_id: str, body: MergedProjectRename, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    q = db.query(MergedProject).filter(MergedProject.id == merged_id)
    if current_user.role not in ("admin", "researcher"):
        q = q.filter(MergedProject.user_id == current_user.id)
    m = q.first()
    if not m: raise HTTPException(404, "Merged project not found")
    exists = db.query(MergedProject).filter(
        MergedProject.user_id == m.user_id,
        MergedProject.name == body.name,
        MergedProject.id != merged_id
    ).first()
    if exists: raise HTTPException(400, "This user already has a merged project with that name")
    m.name = body.name
    db.commit()
    db.refresh(m)
    return MergedProjectOut.from_orm_with_owner(m)

@router.delete("/projects/{merged_id}")
def delete_merged(merged_id: str, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    q = db.query(MergedProject).filter(MergedProject.id == merged_id)
    if current_user.role not in ("admin", "researcher"):
        q = q.filter(MergedProject.user_id == current_user.id)
    m = q.first()
    if not m: raise HTTPException(404, "Merged project not found")
    db.delete(m)
    db.commit()
    return {"deleted": merged_id}