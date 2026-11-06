from fastapi import APIRouter,Depends,HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.security import get_current_user
router=APIRouter(prefix="/users",tags=["User Management"])
class ActiveUpdate(BaseModel):
    is_active: bool

def require_admin(user:User):
    if user.role!="admin": raise HTTPException(403,"Administrator role required")

@router.get("")
def list_users(db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    require_admin(user)
    return [{"id":u.id,"email":u.email,"full_name":u.full_name,"role":u.role,"is_active":u.is_active,"created_at":u.created_at.isoformat()} for u in db.query(User).order_by(User.id).all()]

@router.patch("/{user_id}/active")
def set_user_active(user_id:int,data:ActiveUpdate,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    require_admin(user)
    target=db.get(User,user_id)
    if not target: raise HTTPException(404,"User not found")
    if target.id==user.id and not data.is_active: raise HTTPException(400,"You cannot deactivate your own account")
    target.is_active=data.is_active;db.commit()
    return {"id":target.id,"is_active":target.is_active}
