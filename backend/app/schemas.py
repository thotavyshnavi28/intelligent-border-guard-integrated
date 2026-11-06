from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, Field, ConfigDict

class RegisterIn(BaseModel):
    email: str
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=128)

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    full_name: str
    role: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"

class SensorReadingIn(BaseModel):
    sensor_id: str = Field(min_length=1, max_length=64)
    sensor_type: Literal["thermal", "motion", "drone", "environment", "cctv", "radar"]
    location_x: float | None = None
    location_y: float | None = None
    target_id: str | None = None
    target_type: Literal["human", "animal", "vehicle", "drone"] | None = None
    readings: dict[str, Any]
    confidence: float = Field(default=0.8, ge=0, le=1)
    simulated: bool = False
    timestamp: datetime | None = None

class RadarTargetIn(BaseModel):
    target_id: str = Field(min_length=1, max_length=64)
    target_type: Literal["human", "animal", "vehicle", "drone"]
    x: float
    y: float
    speed: float = Field(ge=0, le=300)
    heading: float = Field(ge=0, lt=360)
    confidence: float = Field(default=0.9, ge=0, le=1)
    simulated: bool = True
    timestamp: datetime | None = None

class IncidentUpdate(BaseModel):
    status: Literal["NEW", "UNDER REVIEW", "CONFIRMED", "RESOLVED", "OPEN", "INVESTIGATING"] | None = None
    review_notes: str | None = Field(default=None, max_length=5000)

class ThreatIn(BaseModel):
    target_id: str
    distance: float = Field(ge=0)
    speed: float = Field(ge=0)
    heading: float = Field(ge=0, lt=360)
    x: float
    y: float
    target_type: Literal["human", "animal", "vehicle", "drone"]
    confidence: float = Field(ge=0, le=1)
    sensors: list[str] = []
    conflict: str | None = None
