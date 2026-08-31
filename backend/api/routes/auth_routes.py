from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select
from backend.api.auth import get_db, verify_password, create_access_token, get_current_reviewer, RequireRole
from backend.data.schema import Reviewer
from pydantic import BaseModel

router = APIRouter()

class Token(BaseModel):
    access_token: str
    token_type: str

class ReviewerProfile(BaseModel):
    email: str

@router.post("/login", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_db)):
    reviewer = session.exec(select(Reviewer).where(Reviewer.email == form_data.username)).first()
    if not reviewer or not verify_password(form_data.password, reviewer.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={"sub": reviewer.email})
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=ReviewerProfile)
async def read_users_me(current_reviewer: Reviewer = Depends(get_current_reviewer)):
    return ReviewerProfile(email=current_reviewer.email)
