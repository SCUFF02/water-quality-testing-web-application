from sqlalchemy import (
    Column, String, Float, DateTime, ForeignKey,
    Enum, Text, Boolean, Integer
)
from sqlalchemy.orm import relationship, declarative_base
from datetime import datetime
import enum
import uuid

Base = declarative_base()

def gen_uuid():
    return str(uuid.uuid4())

class UserRole(str, enum.Enum):
    user       = "user"
    researcher = "researcher"
    admin      = "admin"

class SystemType(str, enum.Enum):
    multisensor = "multisensor"
    dosing      = "dosing"

# ── Users ────────────────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"
    id          = Column(String(36),  primary_key=True, default=gen_uuid)
    username    = Column(String(80),  unique=True, nullable=False, index=True)
    email       = Column(String(120), unique=True, nullable=False, index=True)
    hashed_pw   = Column(String(255), nullable=False)
    role        = Column(Enum(UserRole), default=UserRole.user, nullable=False)
    is_approved = Column(Boolean, default=False, nullable=False)
    created_at  = Column(DateTime, default=datetime.utcnow)

    projects = relationship("Project", back_populates="owner", cascade="all, delete")

# ── Projects ─────────────────────────────────────────────────────────────────
class Project(Base):
    __tablename__ = "projects"
    id          = Column(String(36),  primary_key=True, default=gen_uuid)
    name        = Column(String(120), nullable=False)
    system_type = Column(Enum(SystemType), nullable=False)
    user_id     = Column(String(36),  ForeignKey("users.id"), nullable=False)
    manual_only = Column(Boolean, default=False)
    status      = Column(String(20), default="idle")
    camera_ip   = Column(String(100), nullable=True, default=None)
    created_at  = Column(DateTime, default=datetime.utcnow)

    owner      = relationship("User",         back_populates="projects")
    samples    = relationship("Sample",       back_populates="project", cascade="all, delete")
    readings   = relationship("SensorReading",back_populates="project", cascade="all, delete")
    dosing_jobs= relationship("DosingJob",    back_populates="project", cascade="all, delete")

# ── Samples ───────────────────────────────────────────────────────────────────
class Sample(Base):
    __tablename__ = "samples"
    id          = Column(String(36),  primary_key=True, default=gen_uuid)
    project_id  = Column(String(36),  ForeignKey("projects.id"), nullable=False)
    sample_name = Column(String(120), nullable=False)
    region      = Column(String(120), default="")

    project  = relationship("Project", back_populates="samples")
    readings = relationship("SensorReading", back_populates="sample", cascade="all, delete")

# ── Sensor readings (MQTT + manual) ──────────────────────────────────────────
class SensorReading(Base):
    __tablename__ = "sensor_readings"
    id          = Column(String(36), primary_key=True, default=gen_uuid)
    project_id  = Column(String(36), ForeignKey("projects.id"), nullable=False)
    sample_id   = Column(String(36), ForeignKey("samples.id"),  nullable=True)
    parameter   = Column(String(60), nullable=False)
    value       = Column(Float,      nullable=False)
    unit        = Column(String(20), default="")
    source      = Column(String(20), default="manual")   # "mqtt" | "manual"
    recorded_at = Column(DateTime,   default=datetime.utcnow)

    project = relationship("Project", back_populates="readings")
    sample  = relationship("Sample",  back_populates="readings")

# ── Dosing jobs (ESP-CAM captures) ───────────────────────────────────────────
class DosingJob(Base):
    __tablename__ = "dosing_jobs"
    id            = Column(String(36),  primary_key=True, default=gen_uuid)
    project_id    = Column(String(36),  ForeignKey("projects.id"), nullable=False)
    source_name   = Column(String(120), default="")
    image_path    = Column(String(255), default="")   # "before" image
    image_path_after = Column(String(255), default="", nullable=True)  # "after" image
    liquid        = Column(String(80),  default="")
    volume_ml     = Column(Float,       nullable=True)
    moles         = Column(Float,       nullable=True)
    concentration = Column(Float,       nullable=True)
    notes         = Column(Text,        default="")
    processed_at  = Column(DateTime,    default=datetime.utcnow)

    project = relationship("Project", back_populates="dosing_jobs") 

# ── Merged projects ───────────────────────────────────────────────────────────
class MergedProject(Base):
    __tablename__ = "merged_projects"
    id           = Column(String(36),  primary_key=True, default=gen_uuid)
    user_id      = Column(String(36),  ForeignKey("users.id"), nullable=False)
    name         = Column(String(120), nullable=False)
    project_a_id = Column(String(36),  ForeignKey("projects.id"), nullable=False)
    project_b_id = Column(String(36),  ForeignKey("projects.id"), nullable=False)
    created_at   = Column(DateTime,    default=datetime.utcnow)

    owner     = relationship("User",    foreign_keys=[user_id])
    project_a = relationship("Project", foreign_keys=[project_a_id])
    project_b = relationship("Project", foreign_keys=[project_b_id])