from pydantic import BaseModel, EmailStr, field_validator, Field
from typing import Optional, List
from datetime import datetime
from app.models import SystemType, UserRole

# ── Auth ──────────────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    username: str      = Field(min_length=3,  max_length=50)
    email:    EmailStr
    password: str      = Field(min_length=6,  max_length=128)
    role:     UserRole = UserRole.user

    @field_validator("email")
    @classmethod
    def email_must_have_real_domain(cls, v: str) -> str:
        domain = v.split("@")[-1]
        parts  = domain.split(".")
        if len(parts) < 2:
            raise ValueError("Email domain must contain a dot (e.g. gmail.com)")
        tld = parts[-1]
        if len(tld) < 2:
            raise ValueError("Email TLD is too short to be valid")
        if len(domain) < 4:
            raise ValueError("Email domain is too short to be valid")
        return v

class UserOut(BaseModel):
    id:         str
    username:   str
    email:      str
    role:       UserRole
    created_at: datetime
    class Config: from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type:   str = "bearer"

class LoginRequest(BaseModel):
    email:    str
    password: str

# ── Projects ──────────────────────────────────────────────────────────────────
class SampleIn(BaseModel):
    sample_name: str = Field(min_length=1, max_length=120)
    region:      str = Field(default="",   max_length=120)

class ProjectCreate(BaseModel):
    name:        str           = Field(min_length=1, max_length=120)
    system_type: SystemType
    manual_only: bool          = False
    samples:     List[SampleIn] = Field(default=[])

class SampleOut(BaseModel):
    id:          str
    sample_name: str
    region:      str
    class Config: from_attributes = True

class ProjectOut(BaseModel):
    id:          str
    name:        str
    system_type: SystemType
    manual_only: bool
    created_at:  datetime
    samples:     List[SampleOut] = []
    class Config: from_attributes = True

# ── Sensor readings ───────────────────────────────────────────────────────────
class ReadingIn(BaseModel):
    sample_id: Optional[str] = None
    parameter: str           = Field(min_length=1, max_length=60)
    value:     float
    unit:      str           = Field(default="",       max_length=20)
    source:    str           = Field(default="manual", max_length=20)

class ReadingOut(BaseModel):
    id:          str
    parameter:   str
    value:       float
    unit:        str
    source:      str
    sample_id:   Optional[str]
    recorded_at: datetime
    class Config: from_attributes = True

# ── Dosing jobs ───────────────────────────────────────────────────────────────
class DosingJobOut(BaseModel):
    id:            str
    source_name:   str
    liquid:        str
    volume_ml:     Optional[float]
    moles:         Optional[float]
    concentration: Optional[float]
    image_path:    str
    processed_at:  datetime
    class Config: from_attributes = True
