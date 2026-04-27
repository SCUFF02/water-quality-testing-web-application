from pydantic import BaseModel, EmailStr, field_validator, Field, model_validator
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
        if not v.lower().endswith("@certe.tn"):
            raise ValueError("Only @certe.tn email addresses are allowed")
        return v

class UserOut(BaseModel):
    id:          str
    username:    str
    email:       str
    role:        UserRole
    is_approved: bool = False
    created_at:  datetime
    class Config: from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type:   str = "bearer"

class LoginRequest(BaseModel):
    email:    str
    password: str

# ── Projects ──────────────────────────────────────────────────────────────────
class SampleIn(BaseModel):
    sample_name: str = Field(min_length=1, max_length=18)
    region:      str = Field(default="",   max_length=25)

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
    id:             str
    name:           str
    system_type:    SystemType
    manual_only:    bool
    status:         str = "idle"
    camera_ip:      Optional[str] = None
    created_at:     datetime
    samples:        List[SampleOut] = []
    owner_username: Optional[str] = None

    @model_validator(mode="after")
    def populate_owner_username(self) -> "ProjectOut":
        return self

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_with_owner(cls, obj) -> "ProjectOut":
        instance = cls.model_validate(obj)
        if hasattr(obj, "owner") and obj.owner:
            instance.owner_username = obj.owner.username
        return instance

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

# ── Merged projects ───────────────────────────────────────────────────────────
class MergedProjectCreate(BaseModel):
    name:         str = Field(min_length=1, max_length=120)
    project_a_id: str
    project_b_id: str

class MergedProjectRename(BaseModel):
    name: str = Field(min_length=1, max_length=120)

class MergedProjectOut(BaseModel):
    id:             str
    name:           str
    project_a_id:   str
    project_b_id:   str
    project_a:      Optional[ProjectOut] = None
    project_b:      Optional[ProjectOut] = None
    created_at:     datetime
    owner_username: Optional[str] = None

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_with_owner(cls, obj) -> "MergedProjectOut":
        instance = cls.model_validate(obj)
        if hasattr(obj, "owner") and obj.owner:
            instance.owner_username = obj.owner.username
        return instance