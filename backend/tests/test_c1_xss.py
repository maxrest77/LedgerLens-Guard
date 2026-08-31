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
            opened_at=datetime.utcnow(),
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
    xss_payload = "This is a valid reason length string <script>alert(1)</script>"
    res_review = client.post(
        "/api/exceptions/case_xss/review", 
        json={"action": "APPROVE", "reason": xss_payload},
        headers={"X-CSRF-Protection": "1"},
        cookies={"session_token": cookie}
    )
    assert res_review.status_code == 200
    
    # 3. Check DB
    case = session.get(ReconciliationCase, "case_xss")
    
    from backend.audit.chain import AuditBlock
    from sqlmodel import select
    block = session.exec(select(AuditBlock).where(AuditBlock.case_id == "case_xss")).first()
    
    # Reason should be escaped
    assert "<script>" not in block.reason
    assert "&lt;script&gt;" in block.reason
