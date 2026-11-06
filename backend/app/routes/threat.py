from fastapi import APIRouter,Depends,HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import ThreatAssessment,FusedTarget,Incident
from app.schemas import ThreatIn
from app.security import get_current_user
from app.services.threat import assess
from app.realtime import manager
router=APIRouter(prefix="/threat",tags=["Threat Assessment"])

@router.post("/assess")
async def assess_target(data:ThreatIn,db:Session=Depends(get_db),_=Depends(get_current_user)):
    result=assess(data.model_dump())
    fused=db.query(FusedTarget).filter_by(target_id=data.target_id).first()
    row=ThreatAssessment(target_type=data.target_type,target_id=result["target_id"],fused_target_id=fused.target_id if fused else None,score=result["score"],level=result["level"],breakdown=result["breakdown"],factors=result["factors"],recommendation=result["recommendation"])
    db.add(row);db.commit();db.refresh(row)
    result["id"]=row.id;result["timestamp"]=row.timestamp.isoformat()
    await manager.broadcast("threats",{"type":"threat_assessment","data":result})
    return result

@router.get("/assessments")
def history(limit:int=100,db:Session=Depends(get_db),_=Depends(get_current_user)):
    rows=db.query(ThreatAssessment).order_by(ThreatAssessment.timestamp.desc()).limit(max(1,min(limit,500))).all()
    return {"assessments":[{"id":r.id,"target_id":r.target_id,"score":r.score,"level":r.level,"breakdown":r.breakdown,"factors":r.factors,"recommendation":r.recommendation,"timestamp":r.timestamp.isoformat()} for r in rows]}
