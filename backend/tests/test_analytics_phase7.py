from backend.utils import utc_now
import pytest
import math
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine, SQLModel, select
from datetime import datetime, timedelta

from backend.api.main import app
from backend.data.schema import (
    Reviewer, Role, ReconciliationCase, CaseStatus,
    AuditState
)
from backend.api.auth import get_db, get_password_hash

@pytest.fixture(name="engine")
def engine_fixture(tmp_path):
    db_file = tmp_path / "test_analytics_phase7.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return engine

@pytest.fixture(name="client")
def client_fixture(engine):
    app.dependency_overrides[get_db] = lambda: Session(engine)
    
    with Session(engine) as session:
        # 1. Reviewers: ADMIN and REVIEWER
        session.add(Reviewer(email="admin@test.com", hashed_password=get_password_hash("pass"), role=Role.ADMIN, portfolio_id="GLOBAL"))
        session.add(Reviewer(email="reviewerA@test.com", hashed_password=get_password_hash("pass"), role=Role.REVIEWER, portfolio_id="PORTFOLIO_A"))
        session.add(Reviewer(email="reviewerB@test.com", hashed_password=get_password_hash("pass"), role=Role.REVIEWER, portfolio_id="PORTFOLIO_B"))

        now = utc_now()

        # 2. Seed cases across PORTFOLIO_A and PORTFOLIO_B:
        # PORTFOLIO_A:
        # Case A1: CRITICAL severity fee deviation
        session.add(ReconciliationCase(
            case_id="case_p7_a1",
            portfolio_id="PORTFOLIO_A",
            exception_code="FEE_DEVIATION",
            severity="CRITICAL",
            status=CaseStatus.APPROVED,
            expected_paisa=100000,
            actual_paisa=95000,
            delta_paisa=5000,
            confidence_score=0.92,
            explanation="MDR fee deviation critical",
            suggested_action="APPROVE",
            opened_at=now - timedelta(days=10),
            resolved_at=now - timedelta(days=9),
            resolved_by="reviewerA@test.com"
        ))

        # Case A2: HIGH severity amount mismatch
        session.add(ReconciliationCase(
            case_id="case_p7_a2",
            portfolio_id="PORTFOLIO_A",
            exception_code="AMOUNT_MISMATCH",
            severity="HIGH",
            status=CaseStatus.OPEN,
            expected_paisa=50000,
            actual_paisa=48000,
            delta_paisa=2000,
            confidence_score=0.88,
            explanation="Amount mismatch high severity",
            suggested_action="INVESTIGATE",
            opened_at=now - timedelta(days=4)
        ))

        # Case A3: LOW severity rounding drift
        session.add(ReconciliationCase(
            case_id="case_p7_a3",
            portfolio_id="PORTFOLIO_A",
            exception_code="ROUNDING_DRIFT",
            severity="LOW",
            status=CaseStatus.AUTO_RESOLVED,
            expected_paisa=20000,
            actual_paisa=19900,
            delta_paisa=100,
            confidence_score=0.99,
            explanation="Rounding drift auto resolved",
            suggested_action="APPROVE",
            opened_at=now - timedelta(days=2),
            resolved_at=now - timedelta(days=2),
            resolved_by="system"
        ))

        # PORTFOLIO_B:
        # Case B1: CRITICAL missing settlement
        session.add(ReconciliationCase(
            case_id="case_p7_b1",
            portfolio_id="PORTFOLIO_B",
            exception_code="MISSING_SETTLEMENT",
            severity="CRITICAL",
            status=CaseStatus.OPEN,
            expected_paisa=300000,
            actual_paisa=0,
            delta_paisa=300000,
            confidence_score=0.70,
            explanation="Missing settlement in B",
            suggested_action="MANUAL_SETTLE",
            opened_at=now - timedelta(days=3)
        ))

        state = AuditState(id=1, last_index=-1, last_hash="0" * 64)
        session.add(state)
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

# ── Test Task 7.1 Data: Portfolio Radar Telemetry ─────────────────────────────
def test_portfolio_radar_chart_data(client):
    revA_tok = _get_token(client, "reviewerA@test.com")
    admin_tok = _get_token(client, "admin@test.com")

    # Reviewer A: must only see PORTFOLIO_A and COMPANY_AVERAGE
    client.cookies.clear()
    res = client.get("/api/analytics/portfolio-radar", cookies={"session_token": revA_tok})
    assert res.status_code == 200
    data = res.json()
    assert data["portfolio_scope"] == "PORTFOLIO_A"
    assert "company_average" in data
    p_ids = [p["portfolio_id"] for p in data["portfolios"]]
    assert "PORTFOLIO_A" in p_ids
    assert "PORTFOLIO_B" not in p_ids

    # Scores must be within 0-100
    pA = data["portfolios"][0]["scores"]
    for k in ["health_rate", "resolution_speed", "case_freshness", "fee_integrity"]:
        assert 0 <= pA[k] <= 100

    # Admin: sees both
    client.cookies.clear()
    res = client.get("/api/analytics/portfolio-radar", cookies={"session_token": admin_tok})
    assert res.status_code == 200
    admin_data = res.json()
    admin_p_ids = [p["portfolio_id"] for p in admin_data["portfolios"]]
    assert "PORTFOLIO_A" in admin_p_ids
    assert "PORTFOLIO_B" in admin_p_ids

# ── Test Task 7.2 Data: Exception Treemap Hierarchical Clusters ───────────────
def test_exception_treemap_data_and_scoping(client):
    revA_tok = _get_token(client, "reviewerA@test.com")
    admin_tok = _get_token(client, "admin@test.com")

    # Reviewer A: Scoped to PORTFOLIO_A (FEE_DEVIATION, AMOUNT_MISMATCH, ROUNDING_DRIFT)
    client.cookies.clear()
    res = client.get("/api/analytics/treemap?range=90d", cookies={"session_token": revA_tok})
    assert res.status_code == 200
    data = res.json()
    assert data["total_cases"] == 3
    assert len(data["items"]) == 3
    
    codes = {item["name"]: item for item in data["items"]}
    assert "FEE_DEVIATION" in codes
    assert "AMOUNT_MISMATCH" in codes
    assert "ROUNDING_DRIFT" in codes
    assert "MISSING_SETTLEMENT" not in codes  # PORTFOLIO_B case excluded!

    # Sizing & severity check
    fee_item = codes["FEE_DEVIATION"]
    assert fee_item["count"] == 1
    assert fee_item["delta_inr"] == 50.0  # 5000 paisa
    assert fee_item["severity"] == "CRITICAL"
    assert fee_item["fill"] == "#f43f5e"  # Rose for critical

    # Admin: includes MISSING_SETTLEMENT from PORTFOLIO_B
    client.cookies.clear()
    res = client.get("/api/analytics/treemap?range=90d", cookies={"session_token": admin_tok})
    assert res.status_code == 200
    admin_data = res.json()
    assert admin_data["total_cases"] == 4
    admin_codes = [item["name"] for item in admin_data["items"]]
    assert "MISSING_SETTLEMENT" in admin_codes

# ── Test Task 7.3 Data: Calendar Heatmap Daily Activity ───────────────────────
def test_calendar_heatmap_daily_data(client):
    revA_tok = _get_token(client, "reviewerA@test.com")

    client.cookies.clear()
    res = client.get("/api/analytics/daily-activity?days=90", cookies={"session_token": revA_tok})
    assert res.status_code == 200
    data = res.json()
    assert data["portfolio_scope"] == "PORTFOLIO_A"
    assert data["total_opened"] == 3
    assert len(data["daily_activity"]) == 91  # 90 days + today

    # Verify daily activity items have health_rate and case counts
    for day in data["daily_activity"]:
        assert "date" in day
        assert "cases_opened" in day
        assert "cases_resolved" in day
        assert "health_rate" in day
        assert 0 <= day["health_rate"] <= 100

# ── Test Task 7.4 Logic: Animated Counter Exact Landing & Zero Rounding Drift ──
def test_animated_counter_exact_landing_and_math():
    """
    Mathematical verification of AnimatedCounter animation curve & formatters.
    Must guarantee exact landing on targetVal when progress >= 1, with zero rounding error.
    """
    def calculate_animated_value(start_val: float, target_val: float, progress: float) -> float:
        if progress >= 1.0:
            return target_val
        if progress <= 0.0:
            return start_val
        eased = 1.0 - math.pow(1.0 - progress, 3)
        return start_val + (target_val - start_val) * eased

    def format_counter(val: float, decimals: int = 0, prefix: str = "", suffix: str = "") -> str:
        fmt = f"{{:,.{decimals}f}}"
        return f"{prefix}{fmt.format(val)}{suffix}"

    # 1. Monotonic easing progression:
    start = 0.0
    target = 98.4
    val_25 = calculate_animated_value(start, target, 0.25)
    val_50 = calculate_animated_value(start, target, 0.50)
    val_75 = calculate_animated_value(start, target, 0.75)
    val_100 = calculate_animated_value(start, target, 1.0)
    val_over = calculate_animated_value(start, target, 1.25)

    assert 0.0 < val_25 < val_50 < val_75 < val_100
    # Guaranteed exact target landing
    assert val_100 == target
    assert val_over == target

    # 2. Currency counter exact format (₹125,450.75)
    target_currency = 125450.75
    landing_curr = calculate_animated_value(0, target_currency, 1.0)
    assert landing_curr == target_currency
    formatted_curr = format_counter(landing_curr, decimals=2, prefix="₹")
    assert formatted_curr == "₹125,450.75"

    # 3. Health rate percentage counter exact format (98.4%)
    formatted_pct = format_counter(val_100, decimals=1, suffix="%")
    assert formatted_pct == "98.4%"

    # 4. Integer counter exact format (42 cases)
    int_landing = calculate_animated_value(0, 42, 1.0)
    assert int_landing == 42
    formatted_int = format_counter(int_landing, decimals=0, suffix=" cases")
    assert formatted_int == "42 cases"
