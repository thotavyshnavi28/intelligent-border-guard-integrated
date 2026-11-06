from pathlib import Path
from fastapi import FastAPI,WebSocket,WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.config import settings
from app.database import Base,engine
from app import models
from app.realtime import manager
from app.config import settings
from app.database import SessionLocal
from app.models import User
from jose import jwt, JWTError
from app.routes import auth,cctv,radar,sensors,fusion,threat,incidents,dashboard,users

Base.metadata.create_all(bind=engine)
Path(settings.upload_dir).mkdir(parents=True,exist_ok=True)
Path(settings.processed_dir).mkdir(parents=True,exist_ok=True)

app=FastAPI(title=settings.app_name,version="0.1.0",description="Academic decision-support backend. Radar and non-camera sensor feeds are simulated.")
app.add_middleware(CORSMiddleware,allow_origins=settings.allowed_origins,allow_credentials=True,allow_methods=["*"],allow_headers=["*"])
app.mount("/media",StaticFiles(directory=settings.processed_dir),name="media")
for route in [auth.router,users.router,cctv.router,radar.router,sensors.router,fusion.router,threat.router,incidents.router,dashboard.router]:
    app.include_router(route,prefix="/api/v1")

@app.get("/health")
def health(): return {"status":"ok","service":settings.app_name,"mode":"academic-prototype"}

async def ws_endpoint(channel:str,websocket:WebSocket):
    token=websocket.query_params.get("token")
    try:
        subject=jwt.decode(token or "",settings.secret_key,algorithms=["HS256"]).get("sub")
        db=SessionLocal()
        try:
            user=db.get(User,int(subject)) if subject else None
            if not user or not user.is_active: raise ValueError("inactive user")
        finally: db.close()
    except (JWTError,ValueError,TypeError):
        await websocket.close(code=1008)
        return
    await manager.connect(channel,websocket)
    try:
        while True: await websocket.receive_text()
    except WebSocketDisconnect: await manager.disconnect(channel,websocket)

@app.websocket("/ws/radar")
async def ws_radar(ws:WebSocket): await ws_endpoint("radar",ws)
@app.websocket("/ws/sensors")
async def ws_sensors(ws:WebSocket): await ws_endpoint("sensors",ws)
@app.websocket("/ws/threats")
async def ws_threats(ws:WebSocket): await ws_endpoint("threats",ws)
@app.websocket("/ws/incidents")
async def ws_incidents(ws:WebSocket): await ws_endpoint("incidents",ws)
