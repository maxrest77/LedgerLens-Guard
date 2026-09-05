import pytest
from datetime import datetime, timezone
from sqlmodel import Session, create_engine, SQLModel
from fastapi.testclient import TestClient

from backend.data.schema import ReconciliationCase, Reviewer, Role
from backend.api.main import app
from backend.api.auth import get_db, create_access_token

def test_exception_detail_handles_all_null_fields_regression(tmp_path):
    """
    REGRESSION TEST for:
    TypeError: Cannot read properties of undefined (reading 'status')
    and undefined/null fields in ExceptionDetail (explanation, suggested_action, confidence_score, delta_paisa, utr, settlement_id, payment_id).
    
    This test verifies that:
    1. A case in the DB with ALL optional fields set to NULL is stored and retrieved successfully by the API.
    2. The API returns status 200 with 'case' object and empty 'evidence' dictionary.
    3. The case payload contains None/null for explanation, suggested_action, delta_paisa, etc. without causing 500 errors.
    """
    db_file = tmp_path / "test_null_case.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)

    def override_get_db():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    # Create admin reviewer for auth
    with Session(engine) as session:
        admin_user = Reviewer(
            email="auditor@ledgerlens.dev",
            role=Role.ADMIN,
            portfolio_id="GLOBAL",
            hashed_password="mock_hash"
        )
        session.add(admin_user)

        # Fixture with ALL optional fields as NULL / None
        null_case = ReconciliationCase(
            case_id="CASE_NULL_EDGE_001",
            portfolio_id="PORT_TEST",
            exception_code="CUSTOM_UNKNOWN",
            severity="MEDIUM",
            expected_paisa=0,
            actual_paisa=0,
            delta_paisa=None,
            confidence_score=0.0,
            explanation=None,
            suggested_action=None,
            status="OPEN",
            settlement_id=None,
            bank_entry_id=None,
            payment_id=None,
            utr=None,
            opened_at=datetime.now(timezone.utc),
            resolved_at=None,
            resolved_by=None,
            audit_block_id=None
        )
        session.add(null_case)
        session.commit()

    token = create_access_token(data={"sub": "auditor@ledgerlens.dev", "role": "ADMIN", "portfolio_id": "GLOBAL"})
    client = TestClient(app)
    headers = {"Authorization": f"Bearer {token}"}

    response = client.get("/api/exceptions/CASE_NULL_EDGE_001", headers=headers)
    assert response.status_code == 200

    payload = response.json()
    assert "case" in payload
    assert "evidence" in payload

    case_data = payload["case"]
    assert case_data["case_id"] == "CASE_NULL_EDGE_001"
    assert case_data["status"] == "OPEN"
    assert case_data["explanation"] is None
    assert case_data["suggested_action"] is None
    assert case_data["delta_paisa"] is None
    assert case_data["settlement_id"] is None
    assert case_data["utr"] is None
    assert case_data["payment_id"] is None
    assert payload["evidence"] == {}

    # Cleanup dependency override
    app.dependency_overrides.clear()
