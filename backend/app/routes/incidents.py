from datetime import datetime,timezone
from fastapi import APIRouter,Depends,HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Incident,ThreatAssessment,FusedTarget
from app.schemas import IncidentUpdate
from app.security import get_current_user
from app.realtime import manager
router=APIRouter(prefix="/incidents",tags=["Incidents"])

def pack(r):
    x=r.location.get("map_x") if r.location else None
    y=r.location.get("map_y") if r.location else None
    return {"id":r.incident_code,"targetId":r.target_id,"target_id":r.target_id,"type":r.target_type,
        "timestamp":r.created_at.isoformat(),"level":r.threat_level,"score":r.score,"status":r.status,
        "location":r.location,"position":f"Map ({x:.1f}, {y:.1f})" if x is not None and y is not None else "Location unavailable",
        "mapX":x,"mapY":y,"sector":"—","description":r.description,"factors":r.factors,"sensors":r.sensors,
        "recommendation":r.recommendation,"reviewNotes":r.review_notes,"timeline":r.timeline}

@router.post("")
async def create_incident(target_id:str,db:Session=Depends(get_db),_=Depends(get_current_user)):
    assessment=db.query(ThreatAssessment).filter_by(target_id=target_id).order_by(ThreatAssessment.timestamp.desc()).first()
    if not assessment: raise HTTPException(404,"No threat assessment exists for this target")
    fused=db.query(FusedTarget).filter_by(target_id=target_id).first()
    location={"map_x":fused.x,"map_y":fused.y,"coordinate_system":"normalized 0-100 frontend map"} if fused else {}
    code=f"INC-{int(datetime.now(timezone.utc).timestamp()*1000)}"
    r=Incident(incident_code=code,target_id=target_id,target_type=assessment.target_type,threat_level=assessment.level,score=assessment.score,assessment_id=assessment.id,status="NEW",location=location,description=f"Threat assessment {assessment.level} ({assessment.score}/100) requires human review.",recommendation=assessment.recommendation,factors=assessment.factors,sensors=fused.sensors if fused else [],timeline=[{"timestamp":datetime.now(timezone.utc).isoformat(),"event":"Incident created from persisted threat assessment"}])
    db.add(r);db.commit();db.refresh(r);result=pack(r)
    await manager.broadcast("incidents",{"type":"incident_created","data":result})
    return result

@router.get("")
def list_incidents(limit:int=100,db:Session=Depends(get_db),_=Depends(get_current_user)):
    rows=db.query(Incident).order_by(Incident.created_at.desc()).limit(max(1,min(limit,500))).all()
    return {"incidents":[pack(r) for r in rows]}

@router.patch("/{incident_code}")
async def update_incident(incident_code:str,data:IncidentUpdate,db:Session=Depends(get_db),_=Depends(get_current_user)):
    r=db.query(Incident).filter_by(incident_code=incident_code).first()
    if not r: raise HTTPException(404,"Incident not found")
    if data.status: r.status={"OPEN":"NEW","INVESTIGATING":"UNDER REVIEW"}.get(data.status,data.status)
    if data.review_notes is not None: r.review_notes=data.review_notes
    r.timeline=[*(r.timeline or []),{"timestamp":datetime.now(timezone.utc).isoformat(),"event":f"Incident updated: status={r.status}"}]
    db.commit();db.refresh(r);result=pack(r)
    await manager.broadcast("incidents",{"type":"incident_updated","data":result})
    return result
