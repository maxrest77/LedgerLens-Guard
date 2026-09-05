from backend.utils import utc_now
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from backend.api.main import app
from backend.data.schema import Reviewer, Role, ReconciliationCase, CaseStatus
from passlib.context import CryptContext
from sqlalchemy.pool import StaticPool

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        session.add(Reviewer(email="test@test.com", hashed_password=pwd_context.hash("pass"), role=Role.ADMIN))
        
        from datetime import datetime
        # Add a mock case
        case = ReconciliationCase(
            case_id="case_xss",
            expected_paisa=100,
            actual_paisa=0,
            delta_paisa=100,
            exception_code="TEST",
            severity="MEDIUM",
            status=CaseStatus.OPEN,
            confidence_score=0.9,
            opened_at=utc_now(),
            explanation="Test",
            suggested_action="Test"
        )
        session.add(case)
        
        session.commit()
        yield session

@pytest.fixture(name="client")
def client_fixture(session: Session):
    from backend.api.auth import get_db
    app.dependency_overrides[get_db] = lambda: session
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()

def test_c1_xss_escape(client, session):
    # 1. Login
    res = client.post("/auth/login", data={"username": "test@test.com", "password": "pass"})
    cookie = res.cookies.get("session_token")
    
    # 2. Submit reason with XSS payload
    xss_payload = "This is a valid reason length string <img src=x onerror=alert(1)>"
    res_review = client.post(
        "/api/exceptions/case_xss/review", 
        json={"action": "APPROVE", "reason": xss_payload},
        headers={"X-CSRF-Protection": "1", "Idempotency-Key": "6ce01b0c-eef8-4770-b930-9e594276d396"},
        cookies={"session_token": cookie}
    )
    assert res_review.status_code == 200
    
    # 3. Check API Response (Audit Trail)
    res_audit = client.get(
        "/api/audit",
        headers={"X-CSRF-Protection": "1", "Idempotency-Key": "a0cda924-8f33-4c65-bd1d-46157e459430"},
        cookies={"session_token": cookie}
    )
    assert res_audit.status_code == 200
    
    audit_data = res_audit.json()
    blocks = audit_data["blocks"]
    
    # Find the block for this case
    case_block = next((b for b in blocks if b["case_id"] == "case_xss"), None)
    assert case_block is not None
    
    # Reason should be escaped in the API response
    assert "<img" not in case_block["reason"]
    assert "&lt;img" in case_block["reason"]

def test_legitimate_long_string(client, session):
    # Add a new mock case for this test
    from datetime import datetime
    case2 = ReconciliationCase(
        case_id="case_long_str",
        expected_paisa=100, actual_paisa=0, delta_paisa=100,
        exception_code="TEST", severity="MEDIUM", status=CaseStatus.OPEN,
        confidence_score=0.9, opened_at=utc_now(),
        explanation="Test", suggested_action="Test"
    )
    session.add(case2)
    session.commit()

    res = client.post("/auth/login", data={"username": "test@test.com", "password": "pass"})
    cookie = res.cookies.get("session_token")
    
    # Submit legitimate long string (e.g. JSON with > 20 chars per word)
    long_payload = 'Valid explanation {"receipt_url":"https://example.com/receipt/123456789012345678901234567890"}'
    res_review = client.post(
        "/api/exceptions/case_long_str/review", 
        json={"action": "APPROVE", "reason": long_payload},
        headers={"X-CSRF-Protection": "1", "Idempotency-Key": "39daf74d-29c3-4938-a904-0102bf045d3b"},
        cookies={"session_token": cookie}
    )
    assert res_review.status_code == 200
    
    # Verify it is flagged
    session.refresh(case2)
    assert case2.reason_flagged is True

def test_validation_boundaries(client, session):
    from datetime import datetime
    case3 = ReconciliationCase(
        case_id="case_bound",
        expected_paisa=100, actual_paisa=0, delta_paisa=100,
        exception_code="TEST", severity="MEDIUM", status=CaseStatus.OPEN,
        confidence_score=0.9, opened_at=utc_now(),
        explanation="Test", suggested_action="Test"
    )
    session.add(case3)
    session.commit()

    res = client.post("/auth/login", data={"username": "test@test.com", "password": "pass"})
    cookie = res.cookies.get("session_token")
    
    # Empty string
    res1 = client.post(
        "/api/exceptions/case_bound/review", 
        json={"action": "APPROVE", "reason": ""},
        headers={"X-CSRF-Protection": "1", "Idempotency-Key": "9cfbf20a-4b97-421a-ad13-3c9baaf9968f"},
        cookies={"session_token": cookie}
    )
    assert res1.status_code == 400
    
    # Below minimum characters (less than 20)
    res2 = client.post(
        "/api/exceptions/case_bound/review", 
        json={"action": "APPROVE", "reason": "Too short"},
        headers={"X-CSRF-Protection": "1", "Idempotency-Key": "be353596-3049-4b98-b8a2-37b0e541c6d0"},
        cookies={"session_token": cookie}
    )
    assert res2.status_code == 400
    
    # Below minimum words (less than 3)
    res3 = client.post(
        "/api/exceptions/case_bound/review", 
        json={"action": "APPROVE", "reason": "A_long_reason_but_only_two_words"},
        headers={"X-CSRF-Protection": "1", "Idempotency-Key": "bd847e23-fe91-48f9-a20e-d2bdbb9e089a"},
        cookies={"session_token": cookie}
    )
    assert res3.status_code == 400
