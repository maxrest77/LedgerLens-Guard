from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.responses import JSONResponse
import time
from collections import defaultdict

class RateLimitMiddleware(BaseHTTPMiddleware):
    instances = []

    def __init__(self, app, max_requests: int = 5, window_seconds: int = 60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests = defaultdict(list)
        RateLimitMiddleware.instances.append(self)
        
    @classmethod
    def reset_all(cls):
        for instance in cls.instances:
            instance.requests.clear()
        
    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/auth/login" and request.method == "POST":
            client_ip = request.client.host if request.client else "unknown"
            now = time.time()
            
            # Clean up old requests
            self.requests[client_ip] = [
                req_time for req_time in self.requests[client_ip]
                if now - req_time < self.window_seconds
            ]
            
            if len(self.requests[client_ip]) >= self.max_requests:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many login attempts. Please try again later."}
                )
                
            self.requests[client_ip].append(now)
            response = await call_next(request)
            if response.status_code == 200:
                self.requests[client_ip].clear()
            return response
            
        return await call_next(request)
