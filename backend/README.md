# Border Sentinel Backend

FastAPI backend for the existing Border Sentinel frontend. The frontend is not modified by this backend package.

## Scope and truthful limitations
- CCTV: real Ultralytics YOLOv8 inference on uploaded images/videos. First run may download the configured model. No live CCTV camera integration is claimed.
- Radar and non-camera sensors: explicitly simulated academic data; not hardware integrations.
- Fusion: only correlates observations when explicit target IDs match, or when timestamps, compatible types and coordinates satisfy configured tolerances. Radar metres are projected to the frontend's 0-100 map for visualization; sensor `location_x/location_y` must use that same normalized map coordinate system. This is a visualization transform, not GPS. CCTV pixel boxes remain evidence-only until camera-to-map calibration is configured.
- Threat: transparent configurable prototype score for human review, not hostile-intent classification or attack prediction.
- Incidents: persistent MySQL records and WebSocket notifications.

## Run locally
1. Python 3.11+ recommended.
2. Create a virtual environment and install dependencies:
   `python -m venv .venv`
   `source .venv/bin/activate` (Windows: `.venv\Scripts\activate`)
   `pip install -r requirements.txt`
3. Copy `.env.example` to `.env` and set `SECRET_KEY` and `DATABASE_URL`.
4. Create the MySQL database:
   `CREATE DATABASE border_sentinel CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
5. Start:
   `uvicorn app.main:app --reload`
6. Open `/docs` for interactive API documentation.

For local smoke testing without MySQL, set `DATABASE_URL=sqlite:///./border_sentinel.db`. Production should use MySQL.

## First administrator
Register using `POST /api/v1/auth/register`. The first account is created with the `admin` role; subsequent public registrations receive `operator`. In a real deployment, disable public registration and provision users administratively.

## API overview
- `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, admin-only `GET /api/v1/users` and `PATCH /api/v1/users/{id}/active`
- `POST /api/v1/cctv/images`, `POST /api/v1/cctv/videos`, `GET /api/v1/cctv/detections`
- `GET /api/v1/radar/targets`, `POST /api/v1/radar/targets`, `POST /api/v1/radar/simulation/start`, `POST /api/v1/radar/simulation/stop`
- `GET /api/v1/sensors`, `POST /api/v1/sensors/readings`, `POST /api/v1/sensors/simulate`
- `POST /api/v1/fusion/run`, `GET /api/v1/fusion/targets`
- `POST /api/v1/threat/assess`, `GET /api/v1/threat/assessments`
- `GET /api/v1/incidents`, `POST /api/v1/incidents`, `PATCH /api/v1/incidents/{id}`
- `GET /api/v1/dashboard/stats`
- WebSockets: `/ws/radar`, `/ws/sensors`, `/ws/threats`, `/ws/incidents` (append `?token=JWT`)

All routes except register/login and health require a bearer token.

## Image/video detection
Upload multipart form field `file`. Images return detections and an annotated image URL. Videos return frame-level detections and a processed video URL. Supported YOLO classes are filtered to person, bicycle, car, motorcycle, bus, truck, boat, bird, cat, dog, horse, sheep, cow and elephant; raw class names and confidence are retained. Coordinates are pixel-space `[x1,y1,x2,y2]`.

Example:
`curl -X POST http://localhost:8000/api/v1/cctv/images -H 'Authorization: Bearer TOKEN' -F 'file=@sample.jpg'`

## Frontend integration notes
The inspected frontend currently creates radar/sensor/fusion data in browser hooks and stores incidents in `localStorage`. The CCTV page's camera button only opens a browser-local `getUserMedia` preview; it does not send camera frames to a backend. Its video upload also only previews the local file. Wire the existing file input to `/cctv/videos` and replace demo detections with the response. Live camera inference needs a separate WebRTC/frame-stream integration and is not implemented here. Its current type contracts include target types `human|animal|vehicle|drone`, sensor kinds `cctv|radar|thermal|motion|drone|environment`, threat levels `LOW|MEDIUM|HIGH|CRITICAL`, and incident states `NEW|UNDER REVIEW|CONFIRMED|RESOLVED`. Backend responses retain these names where appropriate. The UI must be deliberately switched from local simulation/localStorage to these APIs; this backend package does not silently modify frontend files.

Set `VITE_API_BASE_URL=https://YOUR-BACKEND-HOST` in Vercel and `VITE_WS_BASE_URL=wss://YOUR-BACKEND-HOST` (or derive WebSocket URL from API base). Do not commit secrets. A separate frontend integration pass is required to wire the existing React hooks and incident store.

## Deployment (Render/Railway)
- Build: `pip install -r requirements.txt`
- Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Configure all `.env.example` values in the provider dashboard.
- Use managed MySQL and persistent object storage/volume for `uploads/` and `processed/`; ephemeral instance disks are not durable.
- Set CORS_ORIGINS to the exact Vercel origin.
- YOLO model download/cache must be persisted or baked into the deployment image. CPU inference may be slow for large videos; use a worker/queue for production workloads.

## Testing
`pytest -q`. Tests use SQLite and stub the heavyweight YOLO model for deterministic route tests; separately validate actual YOLO inference on a machine with the model weights and OpenCV installed.
