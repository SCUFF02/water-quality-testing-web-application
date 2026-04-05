from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import User
from app.schemas import UserCreate, UserOut, Token, LoginRequest
from app.auth import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register", response_model=UserOut)
def register(body: UserCreate, db: Session = Depends(get_db)):
    """
    Create a new user account.
    Called by the SignUp page.
    """
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(400, "Email already registered")
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(400, "Username already taken")
    user = User(
        username  = body.username,
        email     = body.email,
        hashed_pw = hash_password(body.password),
        role      = body.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.post("/login", response_model=Token)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """
    Log in with email + password.
    Returns a JWT token that the frontend stores and sends with every request.
    The token contains: user id, role, and username.
    """
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.hashed_pw):
        raise HTTPException(401, "Invalid credentials")
    # Include username in the token so the frontend can read it without another API call
    token = create_access_token({
        "sub":      user.id,
        "role":     user.role,
        "username": user.username,
    })
    return {"access_token": token}

@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    """Returns the currently logged-in user's info."""
    return current_user