import os
from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlmodel import Session, select
from backend.db.init import engine
from backend.data.schema import Reviewer
from passlib.context import CryptContext

from backend.config.settings import settings
from backend.utils.time_utils import utc_now

SECRET_KEY = settings.SECRET_KEY
ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES
REFRESH_TOKEN_EXPIRE_DAYS = settings.REFRESH_TOKEN_EXPIRE_DAYS

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def get_db():
    with Session(engine) as session:
        yield session

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = utc_now() + expires_delta
    else:
        # Access token is short-lived (15 minutes)
        expire = utc_now() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = utc_now() + expires_delta
    else:
        # Refresh token is long-lived (7 days)
        expire = utc_now() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

from fastapi import Request

async def get_current_reviewer(request: Request, session: Session = Depends(get_db)) -> Reviewer:
    # 1. Enforce CSRF protection on state-changing methods
    if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
        if request.headers.get("X-CSRF-Protection") != "1":
            raise HTTPException(
                status_code=403, 
                detail="Missing X-CSRF-Protection header"
            )

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # Try Bearer header first, then fallback to session_token cookie
    candidate_tokens = []
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        candidate_tokens.append(auth_header.split(" ")[1])
    cookie_token = request.cookies.get("session_token")
    if cookie_token and cookie_token not in candidate_tokens:
        candidate_tokens.append(cookie_token)
            
    if not candidate_tokens:
        raise credentials_exception

    for tok in candidate_tokens:
        try:
            payload = jwt.decode(tok, SECRET_KEY, algorithms=[ALGORITHM])
            email: str = payload.get("sub")
            if email:
                reviewer = session.exec(select(Reviewer).where(Reviewer.email == email)).first()
                if reviewer:
                    return reviewer
        except JWTError:
            continue
        
    raise credentials_exception

def RequireRole(allowed_roles: list[str]):
    def role_checker(reviewer: Reviewer = Depends(get_current_reviewer)):
        if reviewer.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role {reviewer.role} not permitted for this action"
            )
        return reviewer
    return role_checker
