import math, random, asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from app.database import get_db, SessionLocal
from app.models import RadarTarget
from app.schemas import RadarTargetIn
from app.security import get_current_user
from app.realtime import manager
router=APIRouter(prefix="/radar",tags=["Radar"])
TYPES=["human","animal","vehicle","drone"]
def sector(x,y):
    bearing=(math.degrees(math.atan2(x,y))+360)%360
    return "A" if bearing>=270 else "B" if bearing<90 else "C" if bearing<180 else "D"
def serialize(t): return {"id":t.target_id,"type":t.target_type,"x":t.x,"y":t.y,"speed":t.speed,"heading":t.heading,"distance":t.distance,"sector":t.sector,"confidence":t.confidence,"timestamp":t.timestamp.isoformat(),"simulated":t.simulated}

@router.get("/targets")
def list_targets(db:Session=Depends(get_db),_=Depends(get_current_user)):
    latest={}
    for t in db.query(RadarTarget).order_by(RadarTarget.timestamp.desc()).limit(500).all(): latest.setdefault(t.target_id,t)
    return {"source":"SIMULATED","targets":[serialize(t) for t in latest.values()]}

@router.post("/targets")
async def add_target(data:RadarTargetIn,db:Session=Depends(get_db),_=Depends(get_current_user)):
    t=RadarTarget(target_id=data.target_id,target_type=data.target_type,x=data.x,y=data.y,speed=data.speed,heading=data.heading,distance=math.hypot(data.x,data.y),sector=sector(data.x,data.y),confidence=data.confidence,simulated=data.simulated,timestamp=data.timestamp or datetime.now(timezone.utc))
    db.add(t); db.commit(); db.refresh(t); result=serialize(t)
    await manager.broadcast("radar",{"type":"target_update","data":result,"source":"SIMULATED"})
    return result

@router.post("/simulation/start")
async def simulation_start(count:int=4,_=Depends(get_current_user)):
    count=max(1,min(count,30)); db=SessionLocal(); targets=[]
    try:
        for i in range(count):
            bearing=random.random()*360; distance=random.uniform(250,950); rad=math.radians(bearing); x=math.sin(rad)*distance; y=math.cos(rad)*distance
            kind=TYPES[i%len(TYPES)]; tid=f"SIM-{int(datetime.now(timezone.utc).timestamp())}-{i+1}"
            t=RadarTarget(target_id=tid,target_type=kind,x=x,y=y,speed=random.uniform(5,40),heading=random.random()*360,distance=distance,sector=sector(x,y),confidence=round(random.uniform(.82,.98),2),simulated=True)
            db.add(t); targets.append(t)
        db.commit()
        for t in targets: db.refresh(t)
        payload={"source":"SIMULATED","targets":[serialize(t) for t in targets]}
        await manager.broadcast("radar",{"type":"simulation_seed","data":payload})
        return payload
    finally: db.close()

@router.post("/simulation/stop")
def simulation_stop(_=Depends(get_current_user)): return {"status":"stopped","note":"No hardware radar is connected."}

@router.websocket("/../ws-radar")
async def unused(): pass

async def radar_socket(websocket:WebSocket):
    await manager.connect("radar",websocket)
    try:
        while True: await websocket.receive_text()
    except WebSocketDisconnect: await manager.disconnect("radar",websocket)
