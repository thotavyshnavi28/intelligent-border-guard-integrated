import random
from datetime import datetime,timezone
from fastapi import APIRouter,Depends,HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import SensorReading, RadarTarget
from app.schemas import SensorReadingIn
from app.security import get_current_user
from app.realtime import manager
router=APIRouter(prefix="/sensors",tags=["Sensors"])

@router.get("")
def list_sensors(db:Session=Depends(get_db),_=Depends(get_current_user)):
    rows=db.query(SensorReading).order_by(SensorReading.timestamp.desc()).limit(300).all()
    unique={}
    for r in rows: unique.setdefault(r.sensor_id,{"sensor_id":r.sensor_id,"sensor_type":r.sensor_type,"last_seen":r.timestamp.isoformat(),"simulated":r.simulated})
    return {"sensors":list(unique.values())}

@router.get("/readings")
def readings(limit:int=100,db:Session=Depends(get_db),_=Depends(get_current_user)):
    if not 1<=limit<=500: raise HTTPException(422,"limit must be between 1 and 500")
    return [{"id":r.id,"sensor_id":r.sensor_id,"sensor_type":r.sensor_type,"target_id":r.target_id,"target_type":r.target_type,"location_x":r.location_x,"location_y":r.location_y,"readings":r.readings,"confidence":r.confidence,"simulated":r.simulated,"timestamp":r.timestamp.isoformat()} for r in db.query(SensorReading).order_by(SensorReading.timestamp.desc()).limit(limit).all()]

@router.post("/readings")
async def create_reading(data:SensorReadingIn,db:Session=Depends(get_db),_=Depends(get_current_user)):
    r=SensorReading(sensor_id=data.sensor_id,sensor_type=data.sensor_type,target_id=data.target_id,target_type=data.target_type,location_x=data.location_x,location_y=data.location_y,readings=data.readings,confidence=data.confidence,simulated=data.simulated,timestamp=data.timestamp or datetime.now(timezone.utc))
    db.add(r); db.commit(); db.refresh(r)
    payload={"id":r.id,"sensor_id":r.sensor_id,"sensor_type":r.sensor_type,"readings":r.readings,"timestamp":r.timestamp.isoformat(),"simulated":r.simulated}
    await manager.broadcast("sensors",{"type":"sensor_reading","data":payload})
    return payload


@router.post("/simulate")
async def simulate(
    count: int = 4,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user)
):
    count = max(1, min(count, 50))
    out = []

    # Get existing simulated radar targets
    radar_targets = (
        db.query(RadarTarget)
        .filter_by(simulated=True)
        .order_by(RadarTarget.timestamp.desc())
        .limit(500)
        .all()
    )

    sensor_types = ["thermal", "motion", "environment", "drone"]

    for i in range(count):
        kind = sensor_types[i % len(sensor_types)]

        readings = {
            "temperature_c": round(random.uniform(18, 38), 1),
            "humidity_pct": random.randint(25, 90),
            "motion_detected": random.choice([True, False]),
            "range_m": round(random.uniform(20, 900), 1),
            "wind_kmh": round(random.uniform(0, 35), 1)
        }

        target_id = None
        target_type = None

        # Environment readings remain independent.
        # Other simulated sensors can be associated with
        # existing simulated radar targets.
        if kind != "environment" and radar_targets:
            target = radar_targets[i % len(radar_targets)]

            target_id = target.target_id
            target_type = target.target_type

            # Convert radar coordinates into the same
            # normalized 0-100 map coordinate system.
            location_x = 50 + (target.x / 20)
            location_y = 50 - (target.y / 20)

        else:
            location_x = round(random.uniform(0, 100), 2)
            location_y = round(random.uniform(0, 100), 2)

        r = SensorReading(
            sensor_id=f"S-{kind.upper()}-{i+1}",
            sensor_type=kind,
            target_id=target_id,
            target_type=target_type,
            location_x=location_x,
            location_y=location_y,
            readings=readings,
            confidence=round(random.uniform(0.7, 0.98), 2),
            simulated=True,
            timestamp=datetime.now(timezone.utc)
        )

        db.add(r)
        db.flush()

        out.append({
            "id": r.id,
            "sensor_id": r.sensor_id,
            "sensor_type": kind,
            "target_id": target_id,
            "target_type": target_type,
            "location_x": location_x,
            "location_y": location_y,
            "readings": readings,
            "simulated": True
        })

    db.commit()

    for item in out:
        await manager.broadcast(
            "sensors",
            {"type": "sensor_reading", "data": item}
        )

    return {
        "source": "SIMULATED",
        "readings": out
    }

