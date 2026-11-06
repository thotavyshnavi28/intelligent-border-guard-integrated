from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.schemas import RegisterIn, UserOut, TokenOut
from app.security import hash_password, verify_password, create_access_token, get_current_user
router=APIRouter(prefix="/auth",tags=["Authentication"])

@router.post("/register",response_model=UserOut)
def register(data:RegisterIn,db:Session=Depends(get_db)):
    email=data.email.lower().strip()
    if db.query(User).filter_by(email=email).first(): raise HTTPException(409,"Email already registered")
    role="admin" if db.query(User).count()==0 else "operator"
    user=User(email=email,full_name=data.full_name,hashed_password=hash_password(data.password),role=role)
    db.add(user); db.commit(); db.refresh(user); return user

@router.post("/login",response_model=TokenOut)
def login(form:OAuth2PasswordRequestForm=Depends(),db:Session=Depends(get_db)):
    user=db.query(User).filter_by(email=form.username.lower()).first()
    if not user or not verify_password(form.password,user.hashed_password): raise HTTPException(401,"Incorrect email or password")
    return {"access_token":create_access_token(str(user.id))}

@router.get("/me",response_model=UserOut)
def me(user:User=Depends(get_current_user)): return user
