import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from backend.api.main import app
from backend.data.schema import Reviewer, Role, ReconciliationCase, CaseStatus
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
        session.add(Reviewer(email='reviewerY@test.com', hashed_password=pwd_context.hash('pass'), role=Role.REVIEWER, portfolio_id='PORTFOLIO_Y'))
        session.add(Reviewer(email='reviewerX2@test.com', hashed_password=pwd_context.hash('pass'), role=Role.REVIEWER, portfolio_id='PORTFOLIO_X'))
        
        caseX = ReconciliationCase(
            case_id='caseX', expected_paisa=100, actual_paisa=0, delta_paisa=100,
            exception_code='TEST', severity='MEDIUM', status=CaseStatus.OPEN,
            confidence_score=0.9, opened_at=utc_now(),
            explanation='Test', suggested_action='Test', portfolio_id='PORTFOLIO_X'
        )
        caseY = ReconciliationCase(
            case_id='caseY', expected_paisa=100, actual_paisa=0, delta_paisa=100,
            exception_code='TEST', severity='CRITICAL', status=CaseStatus.OPEN,
            confidence_score=0.9, opened_at=utc_now(),
            explanation='Test', suggested_action='Test', portfolio_id='PORTFOLIO_Y'
        )
        session.add(caseX)
        session.add(caseY)
        session.commit()
        yield session

@pytest.fixture(name='client')
def client_fixture(session: Session):
    from backend.api.auth import get_db
    app.dependency_overrides[get_db] = lambda: session
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()

def test_idor_out_of_scope_rejection(client, session):
    res = client.post('/auth/login', data={'username': 'reviewerX@test.com', 'password': 'pass'})
    cookie = res.cookies.get('session_token')
    
    res_review = client.post(
        '/api/exceptions/caseY/review', 
        json={'action': 'APPROVE', 'reason': 'This is a legitimate reason.'},
        headers={'X-CSRF-Protection': '1', 'Idempotency-Key': '758f2aae-571f-4ad0-bedc-216bae46d430'},
        cookies={'session_token': cookie}
    )
    assert res_review.status_code == 403
    assert res_review.json()['detail'] == 'CASE_OUT_OF_SCOPE'
    
    from backend.audit.chain import AuditBlock
    from sqlmodel import select
    block = session.exec(select(AuditBlock).where(AuditBlock.case_id == 'caseY')).first()
    assert block is not None
    assert block.action == 'UNAUTHORIZED_ACCESS_ATTEMPT'
    assert 'Attempted to mutate case out of scope' in block.reason

def test_idor_in_scope_success(client, session):
    res = client.post('/auth/login', data={'username': 'reviewerX@test.com', 'password': 'pass'})
    cookie = res.cookies.get('session_token')
    
    res_review = client.post(
        '/api/exceptions/caseX/review', 
        json={'action': 'APPROVE', 'reason': 'This is a legitimate reason.'},
        headers={'X-CSRF-Protection': '1', 'Idempotency-Key': '5ad401a7-393d-44a8-bd56-148367f2c517'},
        cookies={'session_token': cookie}
    )
    assert res_review.status_code == 200

def test_idor_other_reviewer_cross_portfolio(client, session):
    res = client.post('/auth/login', data={'username': 'reviewerX2@test.com', 'password': 'pass'})
    cookie = res.cookies.get('session_token')
    
    res_review = client.post(
        '/api/exceptions/caseY/review', 
        json={'action': 'APPROVE', 'reason': 'This is a legitimate reason.'},
        headers={'X-CSRF-Protection': '1', 'Idempotency-Key': 'ce8f380c-0891-4ed5-8988-20347764dbd9'},
        cookies={'session_token': cookie}
    )
    assert res_review.status_code == 403
    assert res_review.json()['detail'] == 'CASE_OUT_OF_SCOPE'

def test_admin_cross_portfolio_cosign_critical_with_audit_override(client, session):
    # 1. Maker stage: reviewerY (in PORTFOLIO_Y) proposes APPROVE on CRITICAL caseY
    res_login_y = client.post('/auth/login', data={'username': 'reviewerY@test.com', 'password': 'pass'})
    cookie_y = res_login_y.cookies.get('session_token')
    
    res_maker = client.post(
        '/api/exceptions/caseY/review',
        json={'action': 'APPROVE', 'reason': 'Maker proposal from portfolio Y reviewer.'},
        headers={'X-CSRF-Protection': '1', 'Idempotency-Key': '11111111-2222-3333-4444-555555555555'},
        cookies={'session_token': cookie_y}
    )
    assert res_maker.status_code == 200
    assert res_maker.json()['case']['status'] == 'PENDING_CO_REVIEW'
    
    # 2. Reviewer in PORTFOLIO_X (reviewerX2) attempts cross-portfolio co-sign -> 403 CASE_OUT_OF_SCOPE
    res_login_sx = client.post('/auth/login', data={'username': 'reviewerX2@test.com', 'password': 'pass'})
    cookie_sx = res_login_sx.cookies.get('session_token')
    res_senior_fail = client.post(
        '/api/exceptions/caseY/review',
        json={'action': 'APPROVE', 'reason': 'Attempted reviewer cross-portfolio co-sign.'},
        headers={'X-CSRF-Protection': '1', 'Idempotency-Key': '22222222-3333-4444-5555-666666666666'},
        cookies={'session_token': cookie_sx}
    )
    assert res_senior_fail.status_code == 403
    assert res_senior_fail.json()['detail'] == 'CASE_OUT_OF_SCOPE'
    
    # 3. Checker stage: ADMIN (admin@test.com, portfolio_id='GLOBAL') performs cross-portfolio fallback co-sign
    res_login_admin = client.post('/auth/login', data={'username': 'admin@test.com', 'password': 'pass'})
    cookie_admin = res_login_admin.cookies.get('session_token')
    res_admin = client.post(
        '/api/exceptions/caseY/review',
        json={'action': 'APPROVE', 'reason': 'Admin fallback co-signing critical case with no in-scope senior approver.'},
        headers={'X-CSRF-Protection': '1', 'Idempotency-Key': '33333333-4444-5555-6666-777777777777'},
        cookies={'session_token': cookie_admin}
    )
    assert res_admin.status_code == 200
    assert res_admin.json()['case']['status'] == 'APPROVED'
    assert res_admin.json()['case']['co_reviewer_email'] == 'admin@test.com'
    
    # 4. Verify distinct audit-chain event ADMIN_CROSS_PORTFOLIO_OVERRIDE was recorded
    from backend.audit.chain import AuditBlock
    from sqlmodel import select
    blocks = session.exec(select(AuditBlock).where(AuditBlock.case_id == 'caseY').order_by(AuditBlock.index)).all()
    actions = [b.action for b in blocks]
    assert 'ADMIN_CROSS_PORTFOLIO_OVERRIDE' in actions
    assert 'APPROVE' in actions
    override_idx = actions.index('ADMIN_CROSS_PORTFOLIO_OVERRIDE')
    approve_idx = actions.index('APPROVE')
    assert override_idx < approve_idx

def test_admin_maker_checker_distinct_identity_enforced(client, session):
    # Admin proposes APPROVE on a new critical case
    case_crit_admin = ReconciliationCase(
        case_id='caseAdminCrit', expected_paisa=500, actual_paisa=0, delta_paisa=500,
        exception_code='TEST', severity='CRITICAL', status=CaseStatus.OPEN,
        confidence_score=0.9, opened_at=utc_now(),
        explanation='Test', suggested_action='Test', portfolio_id='PORTFOLIO_Y'
    )
    session.add(case_crit_admin)
    session.commit()
    
    res_login_admin = client.post('/auth/login', data={'username': 'admin@test.com', 'password': 'pass'})
    cookie_admin = res_login_admin.cookies.get('session_token')
    
    # Step 1: Admin proposes APPROVE (Maker stage)
    res_maker = client.post(
        '/api/exceptions/caseAdminCrit/review',
        json={'action': 'APPROVE', 'reason': 'Admin acting as initial maker proposing approval.'},
        headers={'X-CSRF-Protection': '1', 'Idempotency-Key': '44444444-5555-6666-7777-888888888888'},
        cookies={'session_token': cookie_admin}
    )
    assert res_maker.status_code == 200
    assert res_maker.json()['case']['status'] == 'PENDING_CO_REVIEW'
    
    # Step 2: SAME Admin attempts to co-sign (Checker stage) -> 403 distinct identity rejection
    res_checker = client.post(
        '/api/exceptions/caseAdminCrit/review',
        json={'action': 'APPROVE', 'reason': 'Same admin attempting self-co-sign fallback override.'},
        headers={'X-CSRF-Protection': '1', 'Idempotency-Key': '55555555-6666-7777-8888-999999999999'},
        cookies={'session_token': cookie_admin}
    )
    assert res_checker.status_code == 403
    assert 'distinct identity' in res_checker.json()['detail']


def test_read_idor_cross_portfolio_blocked(client, session):
    # reviewerX (PORTFOLIO_X) attempts to read caseY (PORTFOLIO_Y) -> 403
    res_x = client.post('/auth/login', data={'username': 'reviewerX@test.com', 'password': 'pass'})
    cookie_x = res_x.cookies.get('session_token')
    
    res_read_fail = client.get('/api/exceptions/caseY', cookies={'session_token': cookie_x})
    assert res_read_fail.status_code == 403
    assert res_read_fail.json()['detail'] == 'CASE_OUT_OF_SCOPE'
    
    # reviewerY (PORTFOLIO_Y) reads caseY -> 200
    res_y = client.post('/auth/login', data={'username': 'reviewerY@test.com', 'password': 'pass'})
    cookie_y = res_y.cookies.get('session_token')
    res_read_ok = client.get('/api/exceptions/caseY', cookies={'session_token': cookie_y})
    assert res_read_ok.status_code == 200
    assert res_read_ok.json()['case']['case_id'] == 'caseY'
    
    # admin (GLOBAL) reads caseY -> 200
    res_admin = client.post('/auth/login', data={'username': 'admin@test.com', 'password': 'pass'})
    cookie_admin = res_admin.cookies.get('session_token')
    res_read_admin = client.get('/api/exceptions/caseY', cookies={'session_token': cookie_admin})
    assert res_read_admin.status_code == 200


def test_workspace_portfolio_scoping(client, session):
    # reviewerX only sees PORTFOLIO_X cases
    res_x = client.post('/auth/login', data={'username': 'reviewerX@test.com', 'password': 'pass'})
    cookie_x = res_x.cookies.get('session_token')
    
    res_ws_x = client.get('/api/workspace', cookies={'session_token': cookie_x})
    assert res_ws_x.status_code == 200
    cases_x = res_ws_x.json()['data']
    for c in cases_x:
        assert c['portfolio_id'] == 'PORTFOLIO_X'
        
    # admin sees cases from all portfolios
    res_admin = client.post('/auth/login', data={'username': 'admin@test.com', 'password': 'pass'})
    cookie_admin = res_admin.cookies.get('session_token')
    res_ws_admin = client.get('/api/workspace', cookies={'session_token': cookie_admin})
    assert res_ws_admin.status_code == 200
    cases_admin = res_ws_admin.json()['data']
    portfolio_ids = {c['portfolio_id'] for c in cases_admin}
    assert 'PORTFOLIO_X' in portfolio_ids
    assert 'PORTFOLIO_Y' in portfolio_ids

