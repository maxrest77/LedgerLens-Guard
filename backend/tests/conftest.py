import os
import pytest
os.environ["HOSTING_REGION"] = "ap-south-1"
from backend.api.main import app, SystemState
from backend.api.middleware.rate_limit import RateLimitMiddleware

@pytest.fixture(autouse=True)
def reset_system_state():
    SystemState.lockdown = False
    SystemState.tampered_index = None
    SystemState.strike_count = 0
    SystemState.locked_case_ids.clear()
    RateLimitMiddleware.reset_all()
    
    yield
    
    SystemState.lockdown = False
    SystemState.tampered_index = None
    SystemState.strike_count = 0
    SystemState.locked_case_ids.clear()
    RateLimitMiddleware.reset_all()
