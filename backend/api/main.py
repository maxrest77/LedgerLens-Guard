import os
import asyncio
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from sqlmodel import Session

from backend.db.init import engine
from backend.audit.chain import verify_chain

from backend.api.routes import (
    auth_routes, dashboard, reconciliation, exceptions, reviewer, audit, webhooks, export
)

app = FastAPI(title="LedgerLens Guard API")

# --- SYSTEM LOCKDOWN STATE ---
class SystemState:
    lockdown: bool = False
    tampered_index: int | None = None

class LockdownMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Always allow preflight OPTIONS requests through
        if request.method == "OPTIONS":
            return await call_next(request)
        
        if SystemState.lockdown:
            allowed = ["/api/audit", "/auth/me", "/auth/login"]
            if not any(request.url.path.startswith(route) for route in allowed):
                return JSONResponse(
                    status_code=503,
                    content={"detail": "System under emergency maintenance. Financial operations are temporarily suspended (Code: ERR_SEC_01)."}
                )
        return await call_next(request)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'"
        return response

# Middleware order matters! Lockdown is added FIRST so it becomes the INNER layer.
# CORS is added SECOND so it becomes the OUTER layer and always adds headers.
app.add_middleware(LockdownMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Protection"],
)

# --- AUTO-VERIFY DAEMON ---
async def auto_verify_daemon():
    """Runs in the background every 30 seconds to check chain integrity."""
    while True:
        try:
            with Session(engine) as session:
                result = verify_chain(session)
                if not result["valid"]:
                    SystemState.lockdown = True
                    SystemState.tampered_index = result["tampered_at_index"]
                    print(f"CRITICAL ALERT: Integrity breach at block {SystemState.tampered_index}. SYSTEM LOCKDOWN ENGAGED.")
                else:
                    if SystemState.lockdown:
                        SystemState.lockdown = False
                        SystemState.tampered_index = None
                        print("✅ SYSTEM SECURED: Integrity verified. Lockdown lifted. Resuming normal operations.")
        except Exception as e:
            print(f"Daemon error: {e}")
        
        await asyncio.sleep(30)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(auto_verify_daemon())
# ------------------------------

app.include_router(auth_routes.router, prefix="/auth", tags=["Auth"])
app.include_router(dashboard.router, prefix="/api", tags=["Dashboard"])
app.include_router(reconciliation.router, prefix="/api", tags=["Reconciliation"])
app.include_router(exceptions.router, prefix="/api", tags=["Exceptions"])
app.include_router(reviewer.router, prefix="/api", tags=["Reviewer"])
app.include_router(audit.router, prefix="/api", tags=["Audit"])
app.include_router(export.router, prefix="/export", tags=["Export"])
app.include_router(webhooks.router, prefix="/webhooks", tags=["Webhooks"])

