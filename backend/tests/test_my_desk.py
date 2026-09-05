import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine, SQLModel
from datetime import datetime, timedelta
from backend.utils.time_utils import utc_now

from backend.api.main import app
from backend.data.schema import Reviewer, Role, ReconciliationCase, CaseStatus
from backend.api.auth import get_db, get_password_hash

@pytest.fixture(name="engine")
def engine_fixture(tmp_path):
    db_file = tmp_path / "test_desk.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return engine

@pytest.fixture(name="client")
def client_fixture(engine):
    app.dependency_overrides[get_db] = lambda: Session(engine)
    now = utc_now()
    
    with Session(engine) as session:
        # Users
        session.add(Reviewer(email="admin@test.com", hashed_password=get_password_hash("pass"), role=Role.ADMIN, portfolio_id="GLOBAL"))
        session.add(Reviewer(email="reviewerA@test.com", hashed_password=get_password_hash("pass"), role=Role.REVIEWER, portfolio_id="PORTFOLIO_A"))
        session.add(Reviewer(email="reviewerB@test.com", hashed_password=get_password_hash("pass"), role=Role.REVIEWER, portfolio_id="PORTFOLIO_B"))

        # Cases in PORTFOLIO_A
        session.add(ReconciliationCase(
            case_id="case_crit_old",
            portfolio_id="PORTFOLIO_A",
            exception_code="AMOUNT_MISMATCH",
            severity="CRITICAL",
            status=CaseStatus.OPEN,
            expected_paisa=200000,
            actual_paisa=100000,
            delta_paisa=100000,
            confidence_score=0.99,
            explanation="Critical open mismatch",
            suggested_action="ESCALATE",
            opened_at=now - timedelta(hours=30)  # Breached 24h SLA
        ))
        session.add(ReconciliationCase(
            case_id="case_crit_new",
            portfolio_id="PORTFOLIO_A",
            exception_code="AMOUNT_MISMATCH",
            severity="CRITICAL",
            status=CaseStatus.OPEN,
            expected_paisa=150000,
            actual_paisa=100000,
            delta_paisa=50000,
            confidence_score=0.97,
            explanation="Critical fresh mismatch",
            suggested_action="APPROVE",
            opened_at=now - timedelta(hours=2)   # Within SLA
        ))
        session.add(ReconciliationCase(
            case_id="case_med",
            portfolio_id="PORTFOLIO_A",
            exception_code="FEE_DEVIATION",
            severity="MEDIUM",
            status=CaseStatus.OPEN,
            expected_paisa=5000,
            actual_paisa=3000,
            delta_paisa=2000,
            confidence_score=0.85,
            explanation="Medium fee deviation",
            suggested_action="APPROVE",
            opened_at=now - timedelta(days=2)
        ))
        # Co-sign pending case in PORTFOLIO_A (maker is reviewerA)
        session.add(ReconciliationCase(
            case_id="case_pending_cosign",
            portfolio_id="PORTFOLIO_A",
            exception_code="AMOUNT_MISMATCH",
            severity="CRITICAL",
            status=CaseStatus.PENDING_CO_REVIEW,
            expected_paisa=500000,
            actual_paisa=400000,
            delta_paisa=100000,
            confidence_score=0.99,
            explanation="Maker proposed approval",
            suggested_action="APPROVE",
            opened_at=now - timedelta(hours=5),
            resolved_by="reviewerA@test.com"  # Maker
        ))

        # Cases in PORTFOLIO_B
        session.add(ReconciliationCase(
            case_id="case_b_open",
            portfolio_id="PORTFOLIO_B",
            exception_code="MISSING_SETTLEMENT",
            severity="HIGH",
            status=CaseStatus.OPEN,
            expected_paisa=90000,
            actual_paisa=0,
            delta_paisa=90000,
            confidence_score=0.92,
            explanation="Portfolio B open exception",
            suggested_action="INVESTIGATE",
            opened_at=now - timedelta(days=1)
        ))

        session.commit()

    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()

def _get_token(client, username, password="pass"):
    client.cookies.clear()
    res = client.post("/auth/login", data={"username": username, "password": password})
    assert res.status_code == 200
    token = res.json()["access_token"]
    client.cookies.clear()
    return token

def test_reviewer_my_desk_scoping_and_hidden_snapshot(client):
    rev_tok = _get_token(client, "reviewerA@test.com")
    client.cookies.clear()
    res = client.get("/api/analytics/my-desk", cookies={"session_token": rev_tok})
    assert res.status_code == 200
    data = res.json()

    # 1. Reviewer identity
    assert data["reviewer_email"] == "reviewerA@test.com"
    assert data["role"] == "REVIEWER"
    assert data["portfolio_id"] == "PORTFOLIO_A"

    # 2. My Queue strictly scoped to PORTFOLIO_A
    q = data["my_queue"]
    assert len(q) == 3  # case_crit_old, case_crit_new, case_med
    case_ids = [c["case_id"] for c in q]
    assert "case_b_open" not in case_ids  # PORTFOLIO_B is strictly excluded!
    
    # 3. Severity then Age ordering: CRITICALs first (oldest first), then MEDIUM
    assert q[0]["case_id"] == "case_crit_old"
    assert q[0]["severity"] == "CRITICAL"
    assert q[0]["sla_status"] == "BREACHED"  # >24h old

    assert q[1]["case_id"] == "case_crit_new"
    assert q[1]["severity"] == "CRITICAL"
    assert q[1]["sla_status"] == "OK"

    assert q[2]["case_id"] == "case_med"
    assert q[2]["severity"] == "MEDIUM"

    # 4. Reviewer sees Task 2.4 Portfolio Health Snapshot as an operational benchmark
    assert data["portfolio_snapshot"] is not None
    assert data["portfolio_snapshot"]["portfolio_id"] == "PORTFOLIO_A"

def test_admin_sees_task_2_4_snapshot_and_cosigns(client):
    admin_tok = _get_token(client, "admin@test.com")
    client.cookies.clear()
    res = client.get("/api/analytics/my-desk", cookies={"session_token": admin_tok})
    assert res.status_code == 200
    data = res.json()

    assert data["role"] == "ADMIN"

    # 1. Task 2.4: ADMIN sees Portfolio Health Snapshot
    snapshot = data["portfolio_snapshot"]
    assert snapshot is not None
    assert "portfolio_health_rate" in snapshot
    assert "company_health_rate" in snapshot
    assert "portfolio_open_count" in snapshot
    assert "company_open_count" in snapshot

    # 2. Task 2.3: Pending My Action shows co-sign request (maker was reviewerA)
    actions = data["pending_my_action"]
    assert len(actions) >= 1
    cosign_item = next((a for a in actions if a["case_id"] == "case_pending_cosign"), None)
    assert cosign_item is not None
    assert cosign_item["action_type"] == "CO_SIGN_REQUEST"
    assert cosign_item["maker_email"] == "reviewerA@test.com"

    # 3. Admin Case Preview only deals with CRITICAL issues
    q = data["my_queue"]
    assert len(q) == 2
    assert {c["case_id"] for c in q} == {"case_crit_old", "case_crit_new"}
    assert all(c["severity"] == "CRITICAL" for c in q)
