from backend.utils import utc_now
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine, SQLModel, select
from datetime import datetime, timedelta

from backend.api.main import app
from backend.data.schema import (
    Reviewer, Role, ReconciliationCase, CaseStatus, AuditState
)
from backend.audit.chain import append_to_chain
from backend.api.auth import get_db, get_password_hash

@pytest.fixture(name="engine")
def engine_fixture(tmp_path):
    db_file = tmp_path / "test_analytics_phase8.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return engine

@pytest.fixture(name="client")
def client_fixture(engine):
    app.dependency_overrides[get_db] = lambda: Session(engine)
    
    with Session(engine) as session:
        # Seed Reviewers
        session.add(Reviewer(email="admin@test.com", hashed_password=get_password_hash("pass"), role=Role.ADMIN, portfolio_id="GLOBAL"))
        session.add(Reviewer(email="reviewer1@test.com", hashed_password=get_password_hash("pass"), role=Role.REVIEWER, portfolio_id="PORT_FINTECH"))
        session.add(Reviewer(email="reviewer2@test.com", hashed_password=get_password_hash("pass"), role=Role.REVIEWER, portfolio_id="PORT_RETAIL"))

        now = utc_now()

        # Seed diverse cases in PORT_FINTECH
        # Case 1: Auto-resolved (exact match)
        session.add(ReconciliationCase(
            case_id="case_p8_f1",
            portfolio_id="PORT_FINTECH",
            exception_code="NONE",
            severity="INFO",
            status=CaseStatus.AUTO_RESOLVED,
            expected_paisa=150000,
            actual_paisa=150000,
            delta_paisa=0,
            confidence_score=1.00,
            explanation="Exact auto-matched settlement",
            suggested_action="APPROVE",
            opened_at=now - timedelta(days=10),
            resolved_at=now - timedelta(days=10),
            resolved_by="system"
        ))

        # Case 2: Critical fee deviation, approved
        session.add(ReconciliationCase(
            case_id="case_p8_f2",
            portfolio_id="PORT_FINTECH",
            exception_code="FEE_DEVIATION",
            severity="CRITICAL",
            status=CaseStatus.APPROVED,
            expected_paisa=250000,
            actual_paisa=240000,
            delta_paisa=10000,
            confidence_score=0.92,
            explanation="Gateway MDR fee deviation",
            suggested_action="APPROVE",
            opened_at=now - timedelta(days=8),
            resolved_at=now - timedelta(days=7),
            resolved_by="reviewer1@test.com"
        ))

        # Case 3: High severity refund excess, rejected
        session.add(ReconciliationCase(
            case_id="case_p8_f3",
            portfolio_id="PORT_FINTECH",
            exception_code="REFUND_EXCESS",
            severity="HIGH",
            status=CaseStatus.REJECTED,
            expected_paisa=180000,
            actual_paisa=160000,
            delta_paisa=20000,
            confidence_score=0.88,
            explanation="Customer refund exceeds payment cap",
            suggested_action="REJECT",
            opened_at=now - timedelta(days=5),
            resolved_at=now - timedelta(days=4),
            resolved_by="reviewer1@test.com"
        ))

        # Case 4: Medium amount mismatch, pending
        session.add(ReconciliationCase(
            case_id="case_p8_f4",
            portfolio_id="PORT_FINTECH",
            exception_code="AMOUNT_MISMATCH",
            severity="MEDIUM",
            status=CaseStatus.OPEN,
            expected_paisa=120000,
            actual_paisa=115000,
            delta_paisa=5000,
            confidence_score=0.85,
            explanation="Settlement net mismatch",
            suggested_action="INVESTIGATE",
            opened_at=now - timedelta(days=2)
        ))

        # Seed cases in PORT_RETAIL
        # Case 5: Retail critical missing settlement, open
        session.add(ReconciliationCase(
            case_id="case_p8_r1",
            portfolio_id="PORT_RETAIL",
            exception_code="MISSING_SETTLEMENT",
            severity="CRITICAL",
            status=CaseStatus.OPEN,
            expected_paisa=500000,
            actual_paisa=0,
            delta_paisa=500000,
            confidence_score=0.78,
            explanation="Orphaned payments without bank credit",
            suggested_action="ESCALATE",
            opened_at=now - timedelta(days=3)
        ))

        # Initialize audit state
        session.add(AuditState(id=1, last_index=-1, last_hash="0" * 64))
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

# ── Test 1: Sankey Diagram Conservation of Flow (Inflow == Outflow) ───────────
def test_sankey_node_conservation_of_flow(client):
    """
    Assert that for every intermediate classification node in the Sankey diagram,
    total inflow equals total outflow (money in must equal money out).
    Also assert that total gateway inflow equals the sum of final outcome values.
    """
    admin_tok = _get_token(client, "admin@test.com")
    res = client.get("/api/analytics/money-flow?range=90d", cookies={"session_token": admin_tok})
    assert res.status_code == 200
    data = res.json()

    nodes = {n["id"]: n for n in data["nodes"]}
    links = data["links"]
    assert len(links) > 0

    node_inflow = {n_id: 0.0 for n_id in nodes}
    node_outflow = {n_id: 0.0 for n_id in nodes}

    for link in links:
        src = link["source"]
        tgt = link["target"]
        val = link["value"]
        assert val > 0, f"Link from {src} to {tgt} has non-positive value {val}"
        node_outflow[src] = round(node_outflow[src] + val, 2)
        node_inflow[tgt] = round(node_inflow[tgt] + val, 2)

    # 1. Total Gateway settlement inflow
    total_gateway_outflow = node_outflow["gateway_settlement"]
    assert total_gateway_outflow == data["total_inflow_inr"]
    assert total_gateway_outflow > 0

    # 2. Conservation of flow for every classification node: Inflow == Outflow
    classification_nodes = [
        "auto_matched",
        "exceptions_critical",
        "exceptions_high",
        "exceptions_medium",
        "exceptions_low"
    ]
    for cid in classification_nodes:
        in_amt = node_inflow[cid]
        out_amt = node_outflow[cid]
        # Inflow must equal outflow for all intermediate nodes
        assert abs(in_amt - out_amt) < 0.01, (
            f"Node {cid} violated conservation of flow: Inflow={in_amt}, Outflow={out_amt}"
        )

    # 3. Total Gateway inflow must equal the sum of all final outcome nodes
    outcome_nodes = ["resolved_approved", "resolved_rejected", "pending_resolution"]
    total_outcome_inflow = round(sum(node_inflow[oid] for oid in outcome_nodes), 2)
    assert abs(total_gateway_outflow - total_outcome_inflow) < 0.01, (
        f"Money leak detected: Total Inflow ({total_gateway_outflow}) != Total Outcomes ({total_outcome_inflow})"
    )

# ── Test 2: Waterfall Final Bar Mathematical Exactness ────────────────────────
def test_waterfall_final_bar_equals_actual_net_settled(client):
    """
    Assert the waterfall's final bar exactly equals Actual Net Settled as computed
    directly from the underlying case data, not a separately-maintained number.
    """
    admin_tok = _get_token(client, "admin@test.com")
    res = client.get("/api/analytics/bridge?range=90d", cookies={"session_token": admin_tok})
    assert res.status_code == 200
    data = res.json()

    steps = data["steps"]
    assert len(steps) >= 3

    # Starting step must be Expected Net
    starting_step = steps[0]
    assert starting_step["label"] == "Expected Net Settlement"
    assert starting_step["type"] == "starting"
    assert starting_step["cumulative_amount"] == data["total_expected_inr"]

    # Final step must be Actual Net Settled
    final_step = steps[-1]
    assert final_step["label"] == "Actual Net Settled"
    assert final_step["type"] == "final"
    assert final_step["delta_amount"] == data["total_actual_inr"]
    assert final_step["cumulative_amount"] == data["total_actual_inr"]

    # Crucial assertion: the cumulative progression through all adjustments
    # before the final step must exactly land on data['total_actual_inr']
    last_adjustment = steps[-2]
    assert abs(last_adjustment["cumulative_amount"] - data["total_actual_inr"]) < 0.01, (
        f"Waterfall adjustment cumulative {last_adjustment['cumulative_amount']} does not equal "
        f"Actual Net Settled {data['total_actual_inr']}"
    )

    # Total Expected - Net Variance must equal Total Actual
    assert abs(data["total_expected_inr"] - data["net_variance_inr"] - data["total_actual_inr"]) < 0.01

# ── Test 3: Portfolio Scoping for Money Flow & Waterfall ──────────────────────
def test_money_flow_and_waterfall_portfolio_scoping(client):
    """
    Assert that reviewers scoped to a portfolio only receive data for their portfolio,
    while admins see the complete aggregate cross-portfolio volume.
    """
    rev1_tok = _get_token(client, "reviewer1@test.com")
    admin_tok = _get_token(client, "admin@test.com")

    # 1. Reviewer 1 (PORT_FINTECH):
    # Cases in FINTECH = 4 (expected: 150k + 250k + 180k + 120k = 700k paisa = ₹7,000.00)
    # actual: 150k + 240k + 160k + 115k = 665k paisa = ₹6,650.00
    res_mf = client.get("/api/analytics/money-flow?range=90d", cookies={"session_token": rev1_tok})
    assert res_mf.status_code == 200
    data_mf = res_mf.json()
    assert data_mf["portfolio_scope"] == "PORT_FINTECH"
    assert data_mf["total_cases_analyzed"] == 4
    assert data_mf["total_inflow_inr"] == 7000.00

    res_bridge = client.get("/api/analytics/bridge?range=90d", cookies={"session_token": rev1_tok})
    assert res_bridge.status_code == 200
    data_bridge = res_bridge.json()
    assert data_bridge["portfolio_scope"] == "PORT_FINTECH"
    assert data_bridge["total_expected_inr"] == 7000.00
    assert data_bridge["total_actual_inr"] == 6650.00
    assert data_bridge["steps"][-1]["cumulative_amount"] == 6650.00

    # 2. Admin (COMPANY_WIDE):
    # Includes PORT_RETAIL case (500k paisa expected = ₹5,000.00, actual = 0)
    # Total expected: ₹12,000.00, Total actual: ₹6,650.00
    res_admin_mf = client.get("/api/analytics/money-flow?range=90d", cookies={"session_token": admin_tok})
    assert res_admin_mf.status_code == 200
    data_admin_mf = res_admin_mf.json()
    assert data_admin_mf["portfolio_scope"] == "COMPANY_WIDE"
    assert data_admin_mf["total_cases_analyzed"] == 5
    assert data_admin_mf["total_inflow_inr"] == 12000.00

    res_admin_bridge = client.get("/api/analytics/bridge?range=90d", cookies={"session_token": admin_tok})
    assert res_admin_bridge.status_code == 200
    data_admin_bridge = res_admin_bridge.json()
    assert data_admin_bridge["portfolio_scope"] == "COMPANY_WIDE"
    assert data_admin_bridge["total_expected_inr"] == 12000.00
    assert data_admin_bridge["total_actual_inr"] == 6650.00
    assert data_admin_bridge["steps"][-1]["cumulative_amount"] == 6650.00
