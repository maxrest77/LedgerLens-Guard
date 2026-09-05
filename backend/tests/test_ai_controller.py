import pytest
from sqlmodel import Session
from backend.db.init import engine
from backend.engine.ai_controller import process_copilot_query
from backend.engine.verified_narrative import validate_narrative_facts

def test_ai_controller_exposure_summary():
    with Session(engine) as session:
        result = process_copilot_query(
            query="What is our total unhedged exposure across all gateways?",
            session=session
        )
        assert result["intent"] == "EXPOSURE_SUMMARY"
        assert result["verified"] is True
        assert "Unhedged Exposure" in result["response"]
        assert result["latency_ms"] < 150  # Must be sub-second
        assert "total_exposure_paisa" in result["structured_data"]

def test_ai_controller_forensic_investigation():
    with Session(engine) as session:
        result = process_copilot_query(
            query="Investigate root cause anomaly for case",
            session=session
        )
        assert result["intent"] == "FORENSIC_INVESTIGATION"
        assert result["verified"] is True
        assert "Forensic Anomaly Report" in result["response"]

def test_ai_controller_dispute_draft():
    with Session(engine) as session:
        result = process_copilot_query(
            query="Draft a formal dispute notice for MDR fee overcharge",
            session=session
        )
        assert result["intent"] == "DISPUTE_DRAFT"
        assert result["verified"] is True
        assert "FORMAL NOTICE OF RECONCILIATION DISCREPANCY" in result["response"]
        assert result["structured_data"]["ready_to_send"] is True

def test_ai_controller_nowcast():
    with Session(engine) as session:
        result = process_copilot_query(
            query="Forecast tomorrow's cash arrivals and settlement delay",
            session=session
        )
        assert result["intent"] == "NOWCAST_LIQUIDITY"
        assert result["verified"] is True
        assert "Settlement Delay Nowcasting" in result["response"]

def test_anti_hallucination_hard_gating():
    # Verify that an injected fabricated number ($9,999,999) fails validation
    trusted_context = {
        "expected_inr": "1500.00",
        "actual_inr": "1400.00",
        "delta_inr": "100.00"
    }
    honest_narrative = "Expected 1500.00 but received 1400.00 with variance 100.00."
    assert validate_narrative_facts(honest_narrative, trusted_context) is True

    hallucinated_narrative = "Expected 1500.00 but received 1400.00 and the company lost 9999999.00."
    assert validate_narrative_facts(hallucinated_narrative, trusted_context) is False


def test_copilot_query_api_endpoint():
    from fastapi.testclient import TestClient
    from backend.api.main import app
    from backend.api.auth import create_access_token

    client = TestClient(app)
    token = create_access_token(data={"sub": "admin@ledgerlens.dev"})

    res = client.post(
        "/api/copilot/query",
        json={"query": "What is our total unhedged exposure across all gateways?"},
        headers={
            "Authorization": f"Bearer {token}",
            "X-CSRF-Protection": "1"
        }
    )
    assert res.status_code == 200
    data = res.json()
    assert data["intent"] == "EXPOSURE_SUMMARY"
    assert data["verified"] is True
    assert "Unhedged Exposure" in data["response"]
    assert "total_exposure_paisa" in data["structured_data"]

