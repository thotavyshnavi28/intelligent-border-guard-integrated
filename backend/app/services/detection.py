from datetime import datetime
from pathlib import Path
import cv2
from app.config import settings

_model = None
ALLOWED = {
    "person", "bird", "airplane", "cat", "dog", "horse", "sheep",
    "cow", "elephant", "bicycle", "car", "motorcycle", "bus", "truck", "boat"
}

def get_model():
    global _model
    if _model is None:
        try:
            from ultralytics import YOLO
        except ImportError as exc:
            raise RuntimeError("Ultralytics is not installed. Install requirements.txt before running detection.") from exc
        _model = YOLO(settings.yolo_model)
    return _model

def classify_label(name: str) -> str:
    if name == "person":
        return "person"
    if name == "airplane":
        return "drone"
    if name == "bird":
        return "bird"
    if name in {"bicycle", "car", "motorcycle", "bus", "truck", "boat"}:
        return "vehicle"
    if name in {"cat", "dog", "horse", "sheep", "cow", "elephant"}:
        return "animal"
    return "other"

def detect_image(source: Path, output: Path) -> list[dict]:
    model = get_model()
    results = model.predict(source=str(source), verbose=False)
    detections = []
    now_str = datetime.now().strftime("%H:%M:%S")
    for result in results:
        h, w = result.orig_shape
        for box in result.boxes:
            cls_id = int(box.cls.item())
            name = str(model.names[cls_id]).lower()
            if name not in ALLOWED:
                continue
            xyxy = [round(float(v), 2) for v in box.xyxy[0].tolist()]
            label = classify_label(name)
            det_id = f"DET-{len(detections) + 1:04d}"
            detections.append({
                "id": det_id,
                "class_name": name,
                "label": label,
                "confidence": round(float(box.conf.item()) * 100, 2),
                "bbox": xyxy,
                "box": {
                    "x": round(xyxy[0] / w, 6),
                    "y": round(xyxy[1] / h, 6),
                    "w": round((xyxy[2] - xyxy[0]) / w, 6),
                    "h": round((xyxy[3] - xyxy[1]) / h, 6),
                },
                "camera": "CAM-04",
                "time": now_str,
                "status": "Detected",
                "source": "backend",
            })
        annotated = result.plot()
        if not cv2.imwrite(str(output), annotated):
            raise RuntimeError("Could not write annotated image")
    return detections

def detect_video(source: Path, output: Path, sample_every: int = 5) -> tuple[list[dict], int]:
    cap = cv2.VideoCapture(str(source))
    if not cap.isOpened():
        raise ValueError("Invalid or unsupported video")
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if width <= 0 or height <= 0:
        cap.release()
        raise ValueError("Video has invalid dimensions")

    fourcc = cv2.VideoWriter_fourcc(*"avc1")
    writer = cv2.VideoWriter(str(output), fourcc, fps, (width, height))
    if not writer.isOpened():
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(str(output), fourcc, fps, (width, height))
    if not writer.isOpened():
        cap.release()
        raise RuntimeError("Could not initialize processed video writer")

    model = get_model()
    detections = []
    frame_no = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if frame_no % sample_every == 0:
                result = model.predict(frame, verbose=False)[0]
                sec = int(frame_no / fps)
                timestamp = f"00:{sec // 60:02d}:{sec % 60:02d}"
                for box in result.boxes:
                    cls_id = int(box.cls.item())
                    name = str(model.names[cls_id]).lower()
                    if name in ALLOWED:
                        xyxy = [round(float(v), 2) for v in box.xyxy[0].tolist()]
                        label = classify_label(name)
                        det_id = f"DET-{len(detections) + 1:04d}"
                        detections.append({
                            "id": det_id,
                            "frame": frame_no,
                            "class_name": name,
                            "label": label,
                            "confidence": round(float(box.conf.item()) * 100, 2),
                            "bbox": xyxy,
                            "box": {
                                "x": round(xyxy[0] / width, 6),
                                "y": round(xyxy[1] / height, 6),
                                "w": round((xyxy[2] - xyxy[0]) / width, 6),
                                "h": round((xyxy[3] - xyxy[1]) / height, 6),
                            },
                            "camera": "CAM-04",
                            "time": timestamp,
                            "status": "Detected",
                            "source": "backend",
                        })
                frame = result.plot()
            writer.write(frame)
            frame_no += 1
    finally:
        cap.release()
        writer.release()
    if frame_no == 0:
        raise ValueError("Video contains no readable frames")
    return detections, frame_no
