import io
import os
os.environ["DATABASE_URL"]="sqlite:///./test_border_sentinel.db"
os.environ["SECRET_KEY"]="test-secret-key-not-for-production"
import cv2
import numpy as np
from fastapi.testclient import TestClient
from app.main import app

client=TestClient(app)

def test_health(): assert client.get("/health").status_code==200

def test_register_login_and_protected_route():
    email="api-test@example.com"
    response=client.post("/api/v1/auth/register",json={"email":email,"full_name":"API Tester","password":"test-password-123"})
    assert response.status_code in (200,409)
    login=client.post("/api/v1/auth/login",data={"username":email,"password":"test-password-123"})
    assert login.status_code==200
    token=login.json()["access_token"]
    stats=client.get("/api/v1/dashboard/stats",headers={"Authorization":f"Bearer {token}"})
    assert stats.status_code==200

def test_cctv_unauthorized_upload():
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    ok, encoded = cv2.imencode(".jpg", img)
    assert ok
    res = client.post("/api/v1/cctv/images", files={"file": ("test.jpg", io.BytesIO(encoded.tobytes()), "image/jpeg")})
    assert res.status_code == 401

def test_cctv_image_upload_and_media_serving():
    email="api-test@example.com"
    login=client.post("/api/v1/auth/login",data={"username":email,"password":"test-password-123"})
    token=login.json()["access_token"]
    headers={"Authorization": f"Bearer {token}"}

    img = np.zeros((240, 320, 3), dtype=np.uint8)
    img[:] = (120, 140, 160)
    ok, encoded = cv2.imencode(".jpg", img)
    assert ok

    res = client.post(
        "/api/v1/cctv/images",
        files={"file": ("test_cctv.jpg", io.BytesIO(encoded.tobytes()), "image/jpeg")},
        headers=headers,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["media_type"] == "image"
    assert "annotated_image_url" in body
    assert isinstance(body["detections"], list)

    # Verify /media serves the annotated image
    media_res = client.get(body["annotated_image_url"])
    assert media_res.status_code == 200
    assert len(media_res.content) > 0
    assert "image" in media_res.headers.get("content-type", "")

def test_cctv_video_upload_and_media_serving():
    email="api-test@example.com"
    login=client.post("/api/v1/auth/login",data={"username":email,"password":"test-password-123"})
    token=login.json()["access_token"]
    headers={"Authorization": f"Bearer {token}"}

    # Generate a brief 10-frame test video
    temp_video = "backend/uploads/temp_unit_test.mp4"
    w = cv2.VideoWriter(temp_video, cv2.VideoWriter_fourcc(*"mp4v"), 10.0, (160, 120))
    for _ in range(10):
        frame = np.zeros((120, 160, 3), dtype=np.uint8)
        w.write(frame)
    w.release()

    with open(temp_video, "rb") as f:
        res = client.post(
            "/api/v1/cctv/videos",
            files={"file": ("test_video.mp4", f, "video/mp4")},
            headers=headers,
        )

    if os.path.exists(temp_video):
        os.remove(temp_video)

    assert res.status_code == 200
    body = res.json()
    assert body["media_type"] == "video"
    assert "processed_video_url" in body
    assert body["frames_processed"] == 10

    # Verify /media serves the processed video
    media_res = client.get(body["processed_video_url"])
    assert media_res.status_code == 200
    assert len(media_res.content) > 0

