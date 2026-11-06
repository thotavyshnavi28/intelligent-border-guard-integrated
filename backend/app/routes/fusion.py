from math import hypot, degrees, atan2
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter,Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import SensorReading,FusedTarget,RadarTarget,Detection
from app.security import get_current_user
from app.services.fusion import fuse_observations
router=APIRouter(prefix="/fusion",tags=["Fusion"])

def sector_of(x,y):
    bearing=(degrees(atan2(x,y))+360)%360
    return "A" if bearing>=270 else "B" if bearing<90 else "C" if bearing<180 else "D"

@router.post("/run")
def run_fusion(db:Session=Depends(get_db),_=Depends(get_current_user)):
    observations=[]
    for r in db.query(SensorReading).order_by(SensorReading.timestamp.desc()).limit(500).all():
        observations.append({"id":f"sensor-{r.id}","sensor_type":r.sensor_type,"target_id":r.target_id,"target_type":r.target_type,"location_x":r.location_x,"location_y":r.location_y,"confidence":r.confidence,"timestamp":r.timestamp,"readings":r.readings})
    for r in db.query(RadarTarget).order_by(RadarTarget.timestamp.desc()).limit(500).all():
        observations.append({"id":f"radar-{r.id}","sensor_type":"radar","target_id":r.target_id,"target_type":r.target_type,"location_x":50+(r.x/20),"location_y":50-(r.y/20),"confidence":r.confidence,"timestamp":r.timestamp,"readings":{"speed_kmh":r.speed,"heading_deg":r.heading,"distance_m":r.distance}})
    # Pixel-space CCTV boxes cannot be matched to world coordinates without camera calibration.
    cctv_evidence=[]
    for record in db.query(Detection).order_by(Detection.created_at.desc()).limit(100).all():
        for idx,d in enumerate(record.detections):
            kind=d.get("label")
            target_type={"person":"human","animal":"animal","bird":"animal","vehicle":"vehicle","drone":"drone"}.get(kind)
            cctv_evidence.append({"id":f"cctv-{record.id}-{idx}","sensor":"cctv","target_type":target_type,"class_name":d.get("class_name"),"confidence":d.get("confidence"),"bbox_normalized":d.get("box"),"created_at":record.created_at.isoformat(),"correlation_status":"unmatched_camera_evidence_requires_calibration"})
            
    fused=fuse_observations(observations)
    saved=[]
    for item in fused:
        if item["x"] is None or item["y"] is None or not item["target_type"]: continue
        record=db.query(FusedTarget).filter_by(target_id=item["target_id"]).first()
        values={"target_type":item["target_type"],"x":item["x"],"y":item["y"],"distance":item["distance"],"speed":item["speed"],"heading":item["heading"],"sector":sector_of(item["x"],item["y"]),"confidence":item["confidence"],"sensors":item["sensors"],"observations":item["observations"]}
        if record is None: record=FusedTarget(target_id=item["target_id"],**values)
        else:
            for key,value in values.items(): setattr(record,key,value)
        db.add(record); saved.append(item)
    db.commit()
    return {"count":len(saved),"targets":saved,"cctv_evidence":cctv_evidence,"cctv_spatial_matching":"Not performed: camera-to-world calibration is not configured","method":"Explicit shared target ID, or timestamp + compatible type + coordinate proximity"}

@router.get("/targets")
def targets(db:Session=Depends(get_db),_=Depends(get_current_user)):
    rows=db.query(FusedTarget).order_by(FusedTarget.timestamp.desc()).limit(200).all()
    return {"targets":[{"target_id":r.target_id,"target_type":r.target_type,"x":r.x,"y":r.y,"distance":r.distance,"speed":r.speed,"heading":r.heading,"sector":r.sector,"confidence":r.confidence,"sensors":r.sensors,"observations":r.observations,"timestamp":r.timestamp.isoformat()} for r in rows]}
