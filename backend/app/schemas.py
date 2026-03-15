from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from app.models import SystemType, UserRole

# ── Auth ──────────────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: UserRole = UserRole.user

class UserOut(BaseModel):
    id: str
    username: str
    email: str
    role: UserRole
    created_at: datetime
    class Config: from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class LoginRequest(BaseModel):
    email: str
    password: str

# ── Projects ──────────────────────────────────────────────────────────────────
class SampleIn(BaseModel):
    sample_name: str
    region: str = ""

class ProjectCreate(BaseModel):
    name: str
    system_type: SystemType
    manual_only: bool = False
    samples: List[SampleIn] = []

class SampleOut(BaseModel):
    id: str
    sample_name: str
    region: str
    class Config: from_attributes = True

class ProjectOut(BaseModel):
    id: str
    name: str
    system_type: SystemType
    manual_only: bool
    created_at: datetime
    samples: List[SampleOut] = []
    class Config: from_attributes = True

# ── Sensor readings ───────────────────────────────────────────────────────────
class ReadingIn(BaseModel):
    sample_id: Optional[str] = None
    parameter: str
    value: float
    unit: str = ""
    source: str = "manual"

class ReadingOut(BaseModel):
    id: str
    parameter: str
    value: float
    unit: str
    source: str
    sample_id: Optional[str]
    recorded_at: datetime
    class Config: from_attributes = True

# ── Dosing jobs ───────────────────────────────────────────────────────────────
class DosingJobOut(BaseModel):
    id: str
    source_name: str
    liquid: str
    volume_ml: Optional[float]
    moles: Optional[float]
    concentration: Optional[float]
    image_path: str
    processed_at: datetime
    class Config: from_attributes = True

# ── Device commands ───────────────────────────────────────────────────────────
class DeviceCommand(BaseModel):
    action: str           # "start" | "stop" | "capture"
    interval_ms: int = 5000