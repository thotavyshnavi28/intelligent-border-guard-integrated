import math, random, asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from app.database import get_db, SessionLocal
from app.models import RadarTarget
from app.schemas import RadarTargetIn
from app.security import get_current_user
from app.realtime import manager

router = APIRouter(prefix="/radar", tags=["Radar"])
TYPES = ["human", "animal", "vehicle", "drone"]

_active_targets: dict[str, dict] = {}
_sim_task: asyncio.Task | None = None

def sector(x, y):
    bearing = (math.degrees(math.atan2(x, y)) + 360) % 360
    return "A" if bearing >= 270 else "B" if bearing < 90 else "C" if bearing < 180 else "D"

def serialize(t):
    return {
        "id": t.target_id,
        "type": t.target_type,
        "x": round(t.x, 2),
        "y": round(t.y, 2),
        "speed": round(t.speed, 1),
        "heading": round(t.heading, 1),
        "distance": round(t.distance, 1),
        "sector": t.sector,
        "confidence": t.confidence,
        "timestamp": t.timestamp.isoformat() if hasattr(t.timestamp, "isoformat") else str(t.timestamp),
        "simulated": t.simulated
    }

async def _run_simulation_loop():
    try:
        while True:
            await asyncio.sleep(1.0)
            if not _active_targets:
                continue

            db = SessionLocal()
            try:
                now = datetime.now(timezone.utc)
                updated_targets = []
                for tid, t in list(_active_targets.items()):
                    drift = (random.random() - 0.5) * 6.0
                    heading = (t["heading"] + drift + 360) % 360
                    metres = (t["speed"] / 3.6)
                    rad = math.radians(heading)
                    x = t["x"] + math.sin(rad) * metres
                    y = t["y"] + math.cos(rad) * metres
                    dist = math.hypot(x, y)
                    if dist > 950:
                        heading = (math.degrees(math.atan2(-x, -y)) + 360) % 360
                        x = t["x"]
                        y = t["y"]
                        dist = math.hypot(x, y)

                    sec = sector(x, y)
                    conf = max(0.60, min(0.99, round(t["confidence"] + (random.random() - 0.5) * 0.02, 2)))
                    t["x"] = round(x, 2)
                    t["y"] = round(y, 2)
                    t["heading"] = round(heading, 1)
                    t["distance"] = round(dist, 1)
                    t["sector"] = sec
                    t["confidence"] = conf
                    t["timestamp"] = now.isoformat()

                    db_target = RadarTarget(
                        target_id=tid,
                        target_type=t["type"],
                        x=t["x"],
                        y=t["y"],
                        speed=t["speed"],
                        heading=t["heading"],
                        distance=t["distance"],
                        sector=t["sector"],
                        confidence=t["confidence"],
                        simulated=True,
                        timestamp=now
                    )
                    db.add(db_target)
                    updated_targets.append(dict(t))
                db.commit()

                for t in updated_targets:
                    await manager.broadcast("radar", {"type": "target_update", "data": t, "source": "SIMULATED"})
                await manager.broadcast("radar", {"type": "targets_frame", "data": updated_targets, "source": "SIMULATED"})
            except Exception:
                db.rollback()
            finally:
                db.close()
    except asyncio.CancelledError:
        pass

@router.get("/targets")
def list_targets(db: Session = Depends(get_db), _=Depends(get_current_user)):
    if _active_targets:
        return {"source": "SIMULATED", "targets": list(_active_targets.values())}
    latest = {}
    for t in db.query(RadarTarget).order_by(RadarTarget.timestamp.desc()).limit(500).all():
        latest.setdefault(t.target_id, t)
    return {"source": "SIMULATED", "targets": [serialize(t) for t in latest.values()]}

@router.post("/targets")
async def add_target(data: RadarTargetIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    dist = math.hypot(data.x, data.y)
    sec = sector(data.x, data.y)
    now = data.timestamp or datetime.now(timezone.utc)
    t = RadarTarget(
        target_id=data.target_id,
        target_type=data.target_type,
        x=data.x,
        y=data.y,
        speed=data.speed,
        heading=data.heading,
        distance=dist,
        sector=sec,
        confidence=data.confidence,
        simulated=data.simulated,
        timestamp=now
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    result = serialize(t)
    _active_targets[data.target_id] = dict(result)
    await manager.broadcast("radar", {"type": "target_update", "data": result, "source": "SIMULATED"})
    return result

@router.post("/simulation/start")
async def simulation_start(count: int = 4, _=Depends(get_current_user)):
    global _sim_task
    count = max(1, min(count, 30))
    db = SessionLocal()
    targets = []
    try:
        _active_targets.clear()
        for i in range(count):
            bearing = random.random() * 360
            distance = random.uniform(250, 950)
            rad = math.radians(bearing)
            x = math.sin(rad) * distance
            y = math.cos(rad) * distance
            kind = TYPES[i % len(TYPES)]
            tid = f"SIM-{int(datetime.now(timezone.utc).timestamp())}-{i+1}"
            sec = sector(x, y)
            conf = round(random.uniform(.82, .98), 2)
            t = RadarTarget(
                target_id=tid,
                target_type=kind,
                x=x,
                y=y,
                speed=random.uniform(8, 40),
                heading=random.random() * 360,
                distance=distance,
                sector=sec,
                confidence=conf,
                simulated=True
            )
            db.add(t)
            targets.append(t)
        db.commit()
        for t in targets:
            db.refresh(t)
            item = serialize(t)
            _active_targets[item["id"]] = item

        payload = {"source": "SIMULATED", "targets": list(_active_targets.values())}
        await manager.broadcast("radar", {"type": "simulation_seed", "data": payload})
        await manager.broadcast("radar", {"type": "simulation_status", "status": "running"})

        if _sim_task is None or _sim_task.done():
            _sim_task = asyncio.create_task(_run_simulation_loop())

        return payload
    finally:
        db.close()

@router.post("/simulation/stop")
async def simulation_stop(_=Depends(get_current_user)):
    global _sim_task
    if _sim_task is not None and not _sim_task.done():
        _sim_task.cancel()
        _sim_task = None
    await manager.broadcast("radar", {"type": "simulation_status", "status": "stopped"})
    return {"status": "stopped", "note": "Simulation stopped. No hardware radar is connected."}

@router.post("/simulation/reset")
async def simulation_reset(count: int = 4, user=Depends(get_current_user)):
    return await simulation_start(count=count, _=user)

@router.websocket("/../ws-radar")
async def unused(): pass

async def radar_socket(websocket: WebSocket):
    await manager.connect("radar", websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect("radar", websocket)
