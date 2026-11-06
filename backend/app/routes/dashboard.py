from fastapi import APIRouter,Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models import Detection,RadarTarget,SensorReading,FusedTarget,ThreatAssessment,Incident
from app.security import get_current_user
router=APIRouter(prefix="/dashboard",tags=["Dashboard"])
@router.get("/stats")
def stats(db:Session=Depends(get_db),_=Depends(get_current_user)):
    latest=db.query(ThreatAssessment).order_by(ThreatAssessment.timestamp.desc()).limit(1000).all()
    return {"cctv_uploads":db.query(Detection).count(),"radar_targets":db.query(RadarTarget.target_id).distinct().count(),"sensor_readings":db.query(SensorReading).count(),"fused_targets":db.query(FusedTarget).count(),"open_incidents":db.query(Incident).filter(Incident.status!="RESOLVED").count(),"threat_levels":{level:sum(1 for a in latest if a.level==level) for level in ["LOW","MEDIUM","HIGH","CRITICAL"]},"system_mode":"ACADEMIC_SIMULATION"}
