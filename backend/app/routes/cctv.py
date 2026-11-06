from pathlib import Path
from uuid import uuid4
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.models import Detection, User
from app.security import get_current_user
from app.services.detection import detect_image, detect_video

from pathlib import Path
from uuid import uuid4
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.models import Detection, User
from app.security import get_current_user
from app.services.detection import detect_image, detect_video

router = APIRouter(prefix="/cctv", tags=["CCTV"])
ALLOWED_IMAGE = {"image/jpeg", "image/png", "image/webp", "image/jpg", "image/x-png"}
ALLOWED_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_VIDEO = {"video/mp4", "video/quicktime", "video/x-msvideo", "video/webm", "video/avi", "video/mpeg"}
ALLOWED_VIDEO_EXT = {".mp4", ".mov", ".avi", ".webm", ".mkv"}

async def save_upload(file: UploadFile, allowed_mimes: set[str], allowed_exts: set[str], folder: Path) -> Path:
    suffix = Path(file.filename or "").suffix.lower()
    ct = (file.content_type or "").lower()
    if ct not in allowed_mimes and suffix not in allowed_exts:
        raise HTTPException(415, f"Unsupported media type: {ct or 'unknown'}")
    folder.mkdir(parents=True, exist_ok=True)
    if not suffix:
        suffix = ".jpg" if allowed_mimes == ALLOWED_IMAGE else ".mp4"
    path = folder / f"{uuid4().hex}{suffix}"
    size = 0
    with path.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > settings.max_upload_mb * 1024 * 1024:
                path.unlink(missing_ok=True)
                raise HTTPException(413, "Upload exceeds configured size limit")
            out.write(chunk)
    if not size:
        path.unlink(missing_ok=True)
        raise HTTPException(400, "Empty upload")
    return path

@router.post("/images")
async def image(file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    path = await save_upload(file, ALLOWED_IMAGE, ALLOWED_IMAGE_EXT, Path(settings.upload_dir))
    output = Path(settings.processed_dir) / f"{path.stem}-annotated.jpg"
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        detections = detect_image(path, output)
    except Exception as exc:
        path.unlink(missing_ok=True)
        raise HTTPException(422, f"Image inference failed: {type(exc).__name__}: {exc}")
    record = Detection(filename=file.filename or path.name, media_type="image", source_path=str(path), result_path=str(output), detections=detections, user_id=user.id)
    db.add(record)
    db.commit()
    db.refresh(record)
    return {
        "id": record.id,
        "media_type": "image",
        "filename": record.filename,
        "detections": detections,
        "count": len(detections),
        "annotated_image_url": f"/media/{output.name}",
        "created_at": record.created_at,
    }

@router.post("/videos")
async def video(file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    path = await save_upload(file, ALLOWED_VIDEO, ALLOWED_VIDEO_EXT, Path(settings.upload_dir))
    output = Path(settings.processed_dir) / f"{path.stem}-processed.mp4"
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        detections, frames = detect_video(path, output)
    except Exception as exc:
        path.unlink(missing_ok=True)
        raise HTTPException(422, f"Video processing failed: {type(exc).__name__}: {exc}")
    record = Detection(filename=file.filename or path.name, media_type="video", source_path=str(path), result_path=str(output), detections=detections, frame_count=frames, user_id=user.id)
    db.add(record)
    db.commit()
    db.refresh(record)
    return {
        "id": record.id,
        "media_type": "video",
        "filename": record.filename,
        "detections": detections,
        "count": len(detections),
        "frames_processed": frames,
        "processed_video_url": f"/media/{output.name}",
        "created_at": record.created_at,
    }

@router.get("/detections")
def history(limit: int = 50, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not 1 <= limit <= 200:
        raise HTTPException(422, "limit must be between 1 and 200")
    rows = db.query(Detection).order_by(Detection.created_at.desc()).limit(limit).all()
    return [{"id": r.id, "filename": r.filename, "media_type": r.media_type, "detections": r.detections, "frame_count": r.frame_count, "created_at": r.created_at} for r in rows]

