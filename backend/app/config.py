from pathlib import Path
import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

BACKEND_DIR = Path(__file__).resolve().parents[1]
os.environ.setdefault("YOLO_CONFIG_DIR", str(BACKEND_DIR / ".ultralytics"))

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    app_name: str = "Border Sentinel API"
    environment: str = "development"
    secret_key: str = "change-this-secret"
    access_token_expire_minutes: int = 60
    database_url: str = f"sqlite:///{BACKEND_DIR.as_posix()}/border_sentinel.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080,http://localhost:3000,http://127.0.0.1:3000"
    upload_dir: str = str(BACKEND_DIR / "uploads")
    processed_dir: str = str(BACKEND_DIR / "processed")
    max_upload_mb: int = 200
    yolo_model: str = str(BACKEND_DIR / "yolov8n.pt")
    radar_update_seconds: float = 1.0

    @property
    def allowed_origins(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]

@lru_cache
def get_settings() -> Settings:
    return Settings()

settings = get_settings()

