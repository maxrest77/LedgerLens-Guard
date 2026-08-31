import os
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
    role: str

from fastapi import Response

@router.post("/login", response_model=Token)
async def login_for_access_token(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_db)
):
    reviewer = session.exec(select(Reviewer).where(Reviewer.email == form_data.username)).first()
    if not reviewer or not verify_password(form_data.password, reviewer.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    from backend.data.schema import RefreshToken
    from datetime import datetime, timedelta
    from backend.api.auth import create_refresh_token
    
    access_token = create_access_token(data={"sub": reviewer.email})
    refresh_token = create_refresh_token(data={"sub": reviewer.email})
    
    # Store refresh token in DB
    db_token = RefreshToken(
        token=refresh_token,
        reviewer_email=reviewer.email,
        expires_at=datetime.utcnow() + timedelta(days=7)
    )
    session.add(db_token)
    session.commit()
    
    is_production = os.getenv("ENV", "development") != "development"
    
    response.set_cookie(
        key="session_token",
        value=access_token,
        httponly=True,
        secure=is_production,
        samesite="strict" if is_production else "lax",
        max_age=15 * 60  # 15 mins
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=is_production,
        samesite="strict" if is_production else "lax",
        max_age=7 * 24 * 3600  # 7 days
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=ReviewerProfile)
async def read_users_me(current_reviewer: Reviewer = Depends(get_current_reviewer)):
    return ReviewerProfile(email=current_reviewer.email, role=current_reviewer.role)

from fastapi import Request
from jose import jwt, JWTError
from backend.api.auth import SECRET_KEY, ALGORITHM

@router.post("/refresh", response_model=Token)
async def refresh_token(request: Request, response: Response, session: Session = Depends(get_db)):
    from backend.data.schema import RefreshToken
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Refresh token missing")
    
    # Check DB
    db_token = session.exec(select(RefreshToken).where(RefreshToken.token == token)).first()
    if not db_token or db_token.revoked:
        raise HTTPException(status_code=401, detail="Refresh token revoked or invalid")
        
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if email != db_token.reviewer_email:
            raise HTTPException(status_code=401, detail="Token mismatch")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
        
    # Generate new access token
    new_access_token = create_access_token(data={"sub": email})
    
    is_production = os.getenv("ENV", "development") != "development"
    response.set_cookie(
        key="session_token",
        value=new_access_token,
        httponly=True,
        secure=is_production,
        samesite="strict" if is_production else "lax",
        max_age=15 * 60
    )
    return {"access_token": new_access_token, "token_type": "bearer"}

@router.post("/logout")
async def logout(request: Request, response: Response, session: Session = Depends(get_db)):
    from backend.data.schema import RefreshToken
    token = request.cookies.get("refresh_token")
    if token:
        db_token = session.exec(select(RefreshToken).where(RefreshToken.token == token)).first()
        if db_token:
            db_token.revoked = True
            session.add(db_token)
            session.commit()
            
    response.delete_cookie("session_token")
    response.delete_cookie("refresh_token")
    return {"detail": "Logged out successfully"}
