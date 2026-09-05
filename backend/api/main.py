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
    auth_routes, dashboard, reconciliation, exceptions, reviewer, audit, webhooks, export, admin, evidence, vault_share, analytics,
    compliance as compliance_routes, copilot
)

from backend.config import settings, validate_settings
from backend.utils.structured_logger import setup_logging
from backend.api.middleware.correlation import CorrelationIdMiddleware

validate_settings()
setup_logging(log_format=settings.LOG_FORMAT)

from backend.api.compliance import enforce_data_localization, enforce_security_configuration
enforce_data_localization()
enforce_security_configuration()
app = FastAPI(title="LedgerLens Guard API")


# --- SYSTEM LOCKDOWN STATE ---
class SystemState:
    lockdown: bool = False
    tampered_index: int | None = None
    strike_count: int = 0
    locked_case_ids: set = set()

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
        elif SystemState.locked_case_ids:
            path_parts = request.url.path.strip("/").split("/")
            if len(path_parts) >= 3 and path_parts[0] == "api" and path_parts[1] == "exceptions":
                case_id = path_parts[2]
                if case_id in SystemState.locked_case_ids and request.method != "GET":
                    return JSONResponse(
                        status_code=403,
                        content={"detail": f"Case {case_id} is temporarily locked for integrity verification."}
                    )
        return await call_next(request)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'"
        # BFCache / Auth Bypass Mitigation
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, proxy-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response

# Middleware order matters! Lockdown is added FIRST so it becomes the INNER layer.
# CORS is added SECOND so it becomes the OUTER layer and always adds headers.
from backend.api.middleware.rate_limit import RateLimitMiddleware

app.add_middleware(RateLimitMiddleware, max_requests=5, window_seconds=60)
app.add_middleware(LockdownMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(CorrelationIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"^https://.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-CSRF-Protection",
        "Idempotency-Key",
        "X-Requested-With",
        "Accept",
        "X-Correlation-ID",
        "X-Request-ID",
        "X-Auth-Transport",
    ],
    expose_headers=[
        "Content-Disposition",
        "Content-Length",
        "Content-Type",
        "X-Correlation-ID",
    ],
)

# --- AUTO-VERIFY DAEMON ---
async def auto_verify_daemon():
    """Runs in the background every 30 seconds to check chain integrity."""
    from backend.audit.chain import append_to_chain, AuditBlock
    from sqlmodel import select
    while True:
        try:
            with Session(engine) as session:
                result = verify_chain(session)
                if not result["valid"]:
                    tampered_idx = result["tampered_at_index"]
                    if tampered_idx != SystemState.tampered_index:
                        # New tamper detected, reset strikes for this new incident
                        SystemState.strike_count = 0
                        SystemState.tampered_index = tampered_idx
                        
                    SystemState.strike_count += 1
                    
                    if SystemState.strike_count == 1:
                        block = session.exec(select(AuditBlock).where(AuditBlock.index == tampered_idx)).first()
                        if block:
                            SystemState.locked_case_ids.add(block.case_id)
                            print(f"STRIKE 1: Case {block.case_id} locked due to integrity mismatch at block {tampered_idx}.")
                    elif SystemState.strike_count == 2 and not SystemState.lockdown:
                        SystemState.lockdown = True
                        print(f"CRITICAL ALERT: Repeated integrity breach at block {tampered_idx}. SYSTEM LOCKDOWN ENGAGED.")
                        append_to_chain(
                            session=session,
                            case_id="SYSTEM",
                            reviewer="SYSTEM_DAEMON",
                            action="LOCKDOWN_TRIGGERED",
                            reason=f"Consecutive integrity verification failures starting at block {tampered_idx}",
                            payload_snapshot={"tampered_index": tampered_idx}
                        )
                        session.commit()
                else:
                    if SystemState.strike_count > 0:
                        SystemState.strike_count = 0
                        SystemState.locked_case_ids.clear()
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
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(export.router, prefix="/export", tags=["Export"])
app.include_router(webhooks.router, prefix="/webhooks", tags=["Webhooks"])
app.include_router(evidence.router, prefix="/api", tags=["Evidence"])
app.include_router(vault_share.router, prefix="/api/vault/share", tags=["Vault Share"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(compliance_routes.router, prefix="/api/compliance", tags=["Compliance"])
app.include_router(compliance_routes.router, prefix="/compliance", tags=["Compliance"])
app.include_router(copilot.router, prefix="/api", tags=["AI Finance Controller Copilot"])

