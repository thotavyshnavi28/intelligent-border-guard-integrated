from datetime import datetime, timezone
from sqlalchemy import String, Integer, Float, Boolean, DateTime, ForeignKey, Text, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

def utcnow(): return datetime.now(timezone.utc)

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(30), default="operator")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    detections = relationship("Detection", back_populates="user")
    radar_targets = relationship("RadarTarget", back_populates="created_by")
    sensor_readings = relationship("SensorReading", back_populates="created_by")
    system_logs = relationship("SystemLog", back_populates="user")

class Detection(Base):
    __tablename__ = "cctv_detections"
    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(255))
    media_type: Mapped[str] = mapped_column(String(20))
    result_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_path: Mapped[str] = mapped_column(String(500))
    detections: Mapped[list] = mapped_column(JSON, default=list)
    frame_count: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    user = relationship("User", back_populates="detections")

class RadarTarget(Base):
    __tablename__ = "radar_targets"
    id: Mapped[int] = mapped_column(primary_key=True)
    target_id: Mapped[str] = mapped_column(String(64), index=True)
    target_type: Mapped[str] = mapped_column(String(30))
    x: Mapped[float] = mapped_column(Float)
    y: Mapped[float] = mapped_column(Float)
    speed: Mapped[float] = mapped_column(Float, default=0)
    heading: Mapped[float] = mapped_column(Float, default=0)
    distance: Mapped[float] = mapped_column(Float, default=0)
    sector: Mapped[str] = mapped_column(String(8))
    confidence: Mapped[float] = mapped_column(Float, default=0.9)
    simulated: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_by = relationship("User", back_populates="radar_targets")
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

class SensorReading(Base):
    __tablename__ = "sensor_readings"
    id: Mapped[int] = mapped_column(primary_key=True)
    sensor_id: Mapped[str] = mapped_column(String(64), index=True)
    sensor_type: Mapped[str] = mapped_column(String(30), index=True)
    location_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_y: Mapped[float | None] = mapped_column(Float, nullable=True)
    target_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    target_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    readings: Mapped[dict] = mapped_column(JSON)
    confidence: Mapped[float] = mapped_column(Float, default=0.8)
    simulated: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_by = relationship("User", back_populates="sensor_readings")
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

class FusedTarget(Base):
    __tablename__ = "fused_targets"
    id: Mapped[int] = mapped_column(primary_key=True)
    target_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    target_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    x: Mapped[float] = mapped_column(Float)
    y: Mapped[float] = mapped_column(Float)
    distance: Mapped[float] = mapped_column(Float)
    speed: Mapped[float] = mapped_column(Float, default=0)
    heading: Mapped[float] = mapped_column(Float, default=0)
    sector: Mapped[str] = mapped_column(String(8))
    confidence: Mapped[float] = mapped_column(Float)
    sensors: Mapped[list] = mapped_column(JSON, default=list)
    observations: Mapped[list] = mapped_column(JSON, default=list)
    conflict: Mapped[str | None] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    assessments = relationship("ThreatAssessment", back_populates="fused_target")

class ThreatAssessment(Base):
    __tablename__ = "threat_assessments"
    id: Mapped[int] = mapped_column(primary_key=True)
    target_type: Mapped[str] = mapped_column(String(30))
    target_id: Mapped[str] = mapped_column(String(64), index=True)
    fused_target_id: Mapped[str | None] = mapped_column(ForeignKey("fused_targets.target_id"), nullable=True)
    score: Mapped[int] = mapped_column(Integer)
    level: Mapped[str] = mapped_column(String(16), index=True)
    breakdown: Mapped[dict] = mapped_column(JSON)
    factors: Mapped[list] = mapped_column(JSON)
    recommendation: Mapped[str] = mapped_column(Text)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    fused_target = relationship("FusedTarget", back_populates="assessments")

class Incident(Base):
    __tablename__ = "incidents"
    id: Mapped[int] = mapped_column(primary_key=True)
    incident_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    target_id: Mapped[str] = mapped_column(String(64), index=True)
    target_type: Mapped[str] = mapped_column(String(30), default="unknown")
    threat_level: Mapped[str] = mapped_column(String(16), index=True)
    score: Mapped[int] = mapped_column(Integer)
    recommendation: Mapped[str] = mapped_column(Text, default="")
    assessment_id: Mapped[int | None] = mapped_column(ForeignKey("threat_assessments.id"), nullable=True)
    assessment = relationship("ThreatAssessment")
    status: Mapped[str] = mapped_column(String(24), default="NEW", index=True)
    location: Mapped[dict] = mapped_column(JSON)
    description: Mapped[str] = mapped_column(Text)
    factors: Mapped[list] = mapped_column(JSON, default=list)
    sensors: Mapped[list] = mapped_column(JSON, default=list)
    review_notes: Mapped[str] = mapped_column(Text, default="")
    timeline: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

class SystemLog(Base):
    __tablename__ = "system_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    level: Mapped[str] = mapped_column(String(16), index=True)
    event: Mapped[str] = mapped_column(String(120), index=True)
    message: Mapped[str] = mapped_column(Text)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    user = relationship("User", back_populates="system_logs")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

Index("ix_sensor_type_time", SensorReading.sensor_type, SensorReading.timestamp)
Index("ix_assessment_target_time", ThreatAssessment.target_id, ThreatAssessment.timestamp)
