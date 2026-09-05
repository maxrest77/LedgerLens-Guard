import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from backend.api.main import app
from backend.data.schema import Reviewer, Role, ReconciliationCase, CaseStatus, ToleranceRule
from passlib.context import CryptContext
from sqlalchemy.pool import StaticPool
from datetime import datetime
from backend.utils.time_utils import utc_now

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')

@pytest.fixture(name='session')
def session_fixture():
    engine = create_engine(
        'sqlite://',
        connect_args={'check_same_thread': False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        session.add(Reviewer(email='admin@test.com', hashed_password=pwd_context.hash('pass'), role=Role.ADMIN, portfolio_id='GLOBAL'))
        session.add(Reviewer(email='reviewerX@test.com', hashed_password=pwd_context.hash('pass'), role=Role.REVIEWER, portfolio_id='PORTFOLIO_X'))
        
        caseX = ReconciliationCase(
            case_id='caseX', expected_paisa=100, actual_paisa=0, delta_paisa=100,
            exception_code='TEST', severity='MEDIUM', status=CaseStatus.OPEN,
            confidence_score=0.9, opened_at=utc_now(),
            explanation='Test', suggested_action='Test', portfolio_id='PORTFOLIO_X'
        )
        session.add(caseX)
        session.commit()
        yield session

@pytest.fixture(name='client')
def client_fixture(session: Session):
    from backend.api.auth import get_db
    app.dependency_overrides[get_db] = lambda: session
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()

def test_idempotency_same_request_cached(client, session):
    res = client.post('/auth/login', data={'username': 'reviewerX@test.com', 'password': 'pass'})
    cookie = res.cookies.get('session_token')
    
    res_review1 = client.post(
        '/api/exceptions/caseX/review', 
        json={'action': 'APPROVE', 'reason': 'Valid explanation string for testing.'},
        headers={'X-CSRF-Protection': '1', 'Idempotency-Key': 'idem-key-123'},
        cookies={'session_token': cookie}
    )
    assert res_review1.status_code == 200
    
    res_review2 = client.post(
        '/api/exceptions/caseX/review', 
        json={'action': 'APPROVE', 'reason': 'Valid explanation string for testing.'},
        headers={'X-CSRF-Protection': '1', 'Idempotency-Key': 'idem-key-123'},
        cookies={'session_token': cookie}
    )
    assert res_review2.status_code == 200
    assert res_review2.json() == res_review1.json()

def test_idempotency_same_key_different_body(client, session):
    res = client.post('/auth/login', data={'username': 'reviewerX@test.com', 'password': 'pass'})
    cookie = res.cookies.get('session_token')
    
    client.post(
        '/api/exceptions/caseX/review', 
        json={'action': 'APPROVE', 'reason': 'Valid explanation string for testing.'},
        headers={'X-CSRF-Protection': '1', 'Idempotency-Key': 'idem-key-diff-body'},
        cookies={'session_token': cookie}
    )
    
    res_review3 = client.post(
        '/api/exceptions/caseX/review', 
        json={'action': 'REJECT', 'reason': 'Valid explanation string for testing.'},
        headers={'X-CSRF-Protection': '1', 'Idempotency-Key': 'idem-key-diff-body'},
        cookies={'session_token': cookie}
    )
    assert res_review3.status_code == 409

def test_idempotency_missing_key_rejected(client, session):
    res = client.post('/auth/login', data={'username': 'reviewerX@test.com', 'password': 'pass'})
    cookie = res.cookies.get('session_token')
    
    res_review4 = client.post(
        '/api/exceptions/caseX/review', 
        json={'action': 'APPROVE', 'reason': 'Valid explanation string for testing.'},
        headers={'X-CSRF-Protection': '1'},
        cookies={'session_token': cookie}
    )
    assert res_review4.status_code == 400
    assert res_review4.json()['detail'] == 'Idempotency-Key header is required'

def test_idempotency_admin_propose(client, session):
    res = client.post('/auth/login', data={'username': 'admin@test.com', 'password': 'pass'})
    cookie = res.cookies.get('session_token')
    
    res1 = client.post(
        '/api/admin/rules/propose', 
        json={'parameter_name': 'test', 'threshold_value': 100, 'reason': 'Test'},
        headers={'X-CSRF-Protection': '1', 'Idempotency-Key': 'idem-key-admin-1'},
        cookies={'session_token': cookie}
    )
    assert res1.status_code == 200
    
    res2 = client.post(
        '/api/admin/rules/propose', 
        json={'parameter_name': 'test', 'threshold_value': 100, 'reason': 'Test'},
        headers={'X-CSRF-Protection': '1', 'Idempotency-Key': 'idem-key-admin-1'},
        cookies={'session_token': cookie}
    )
    assert res2.status_code == 200
    assert res2.json() == res1.json()
    
    rules = session.exec(select(ToleranceRule)).all()
    assert len(rules) == 1
