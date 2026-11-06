import io
from pathlib import Path
import cv2
from ultralytics.utils import ASSETS
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def get_auth_headers():
    email = "cctv-tester@example.com"
    pwd = "Test-password-123!"
    client.post("/api/v1/auth/register", json={"email": email, "full_name": "CCTV Tester", "password": pwd})
    login_res = client.post("/api/v1/auth/login", data={"username": email, "password": pwd})
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

def test_e2e_image_upload_and_inference():
    headers = get_auth_headers()
    bus_path = Path(ASSETS) / "bus.jpg"
    assert bus_path.exists(), "bus.jpg asset not found"

    with open(bus_path, "rb") as f:
        res = client.post(
            "/api/v1/cctv/images",
            files={"file": ("bus.jpg", f, "image/jpeg")},
            headers=headers,
        )

    assert res.status_code == 200, f"Image upload failed: {res.text}"
    data = res.json()
    assert data["media_type"] == "image"
    assert data["filename"] == "bus.jpg"
    assert data["count"] > 0
    assert len(data["detections"]) == data["count"]

    first = data["detections"][0]
    assert "id" in first
    assert "label" in first
    assert "confidence" in first
    assert "box" in first
    assert "camera" in first
    assert "status" in first
    assert "source" in first
    assert first["source"] == "backend"

    # Verify /media serves the annotated image
    media_url = data["annotated_image_url"]
    media_res = client.get(media_url)
    assert media_res.status_code == 200
    assert len(media_res.content) > 10000
    assert "image" in media_res.headers.get("content-type", "")

def test_e2e_video_upload_and_inference():
    headers = get_auth_headers()
    bus_path = Path(ASSETS) / "bus.jpg"
    bus_img = cv2.imread(str(bus_path))
    h, w, _ = bus_img.shape

    test_video_path = Path("backend/uploads/e2e_test_video.mp4")
    writer = cv2.VideoWriter(str(test_video_path), cv2.VideoWriter_fourcc(*"mp4v"), 10.0, (w, h))
    for _ in range(10):
        writer.write(bus_img)
    writer.release()

    try:
        with open(test_video_path, "rb") as f:
            res = client.post(
                "/api/v1/cctv/videos",
                files={"file": ("e2e_test_video.mp4", f, "video/mp4")},
                headers=headers,
            )

        assert res.status_code == 200, f"Video upload failed: {res.text}"
        data = res.json()
        assert data["media_type"] == "video"
        assert data["filename"] == "e2e_test_video.mp4"
        assert data["frames_processed"] == 10
        assert data["count"] > 0

        first = data["detections"][0]
        assert "id" in first
        assert "label" in first
        assert "confidence" in first
        assert "box" in first
        assert "frame" in first

        # Verify /media serves the processed video
        media_url = data["processed_video_url"]
        media_res = client.get(media_url)
        assert media_res.status_code == 200
        assert len(media_res.content) > 10000
        assert "video" in media_res.headers.get("content-type", "")
    finally:
        test_video_path.unlink(missing_ok=True)

def test_e2e_cctv_detections_history():
    headers = get_auth_headers()
    res = client.get("/api/v1/cctv/detections", headers=headers)
    assert res.status_code == 200
    records = res.json()
    assert len(records) >= 2
    types = {r["media_type"] for r in records}
    assert "image" in types
    assert "video" in types
