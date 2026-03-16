"""
Users router — allows admins and researchers to list/view users.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.db import get_db
from app.models import User, Project, UserRole
from app.schemas import UserOut
from app.auth import get_current_user

router = APIRouter(prefix="/users", tags=["users"])

class UserWithStats(UserOut):
    project_count: int = 0
    class Config: from_attributes = True

@router.get("", response_model=List[UserOut])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns all users except admins.
    Accessible by: admins and researchers.
    Used by ResearcherPage and AdminPage.
    """
    if current_user.role not in [UserRole.admin, UserRole.researcher]:
        raise HTTPException(403, "Not allowed")
    # Exclude admins from the list
    return db.query(User).filter(User.role != UserRole.admin).all()

@router.get("/all", response_model=List[UserOut])
def list_all_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns ALL users including admins. Admin only."""
    if current_user.role != UserRole.admin:
        raise HTTPException(403, "Admin only")
    return db.query(User).all()

@router.get("/{username}/projects")
def get_user_projects(
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns all projects for a given username.
    Used by ResearcherPage and PublicProfilePage to show another user's projects.
    Accessible by: admins and researchers.
    """
    if current_user.role not in [UserRole.admin, UserRole.researcher]:
        raise HTTPException(403, "Not allowed")
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(404, "User not found")
    projects = db.query(Project).filter(Project.user_id == user.id).all()
    return [
        {
            "id":          p.id,
            "name":        p.name,
            "system_type": p.system_type,
            "created_at":  p.created_at.isoformat(),
            "manual_only": p.manual_only,
            "samples": [
                {"id": s.id, "sample_name": s.sample_name, "region": s.region}
                for s in p.samples
            ],
        }
        for p in projects
    ]

@router.delete("/{user_id}")
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a user. Admin only."""
    if current_user.role != UserRole.admin:
        raise HTTPException(403, "Admin only")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    db.delete(user)
    db.commit()
    return {"deleted": user_id}

@router.patch("/{user_id}/role")
def update_role(
    user_id: str,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change a user's role. Admin only."""
    if current_user.role != UserRole.admin:
        raise HTTPException(403, "Admin only")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.role = body.get("role", user.role)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "role": user.role}