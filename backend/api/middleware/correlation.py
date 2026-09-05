import time
import uuid
import logging
from contextvars import ContextVar
from typing import Optional
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("ledgerlens.access")

_correlation_id_ctx: ContextVar[Optional[str]] = ContextVar("correlation_id", default=None)

def get_correlation_id() -> Optional[str]:
    """Returns the correlation ID for the current request context."""
    return _correlation_id_ctx.get()

def set_correlation_id(corr_id: str) -> None:
    """Sets the correlation ID for the current context."""
    _correlation_id_ctx.set(corr_id)

class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """
    Middleware that ensures every request has a unique correlation ID.
    Propagates incoming X-Correlation-ID or X-Request-ID headers,
    or generates a new UUID4. Logs request completion with latency.
    """
    async def dispatch(self, request: Request, call_next) -> Response:
        corr_id = (
            request.headers.get("X-Correlation-ID")
            or request.headers.get("X-Request-ID")
            or uuid.uuid4().hex
        )
        
        token = _correlation_id_ctx.set(corr_id)
        request.state.correlation_id = corr_id
        start_time = time.perf_counter()

        try:
            response = await call_next(request)
        finally:
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            
            # Log structured access line
            status_code = getattr(response, "status_code", 500) if "response" in locals() else 500
            logger.info(
                f"{request.method} {request.url.path} -> {status_code} ({duration_ms}ms)",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": status_code,
                    "duration_ms": duration_ms,
                    "correlation_id": corr_id,
                    "client_ip": request.client.host if request.client else "unknown"
                }
            )
            _correlation_id_ctx.reset(token)

        response.headers["X-Correlation-ID"] = corr_id
        return response
