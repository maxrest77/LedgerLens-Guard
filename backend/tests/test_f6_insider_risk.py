import pytest
from datetime import datetime, timedelta
from backend.utils.time_utils import utc_now
from sqlmodel import Session, create_engine, SQLModel
from backend.audit.chain import AuditBlock
from backend.data.schema import ReconciliationCase
from backend.engine.insider_risk import evaluate_reviewer_risk

def test_f6_insider_risk(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/test_f6.db", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    
    with Session(engine) as session:
        # Create some cases opened 2 seconds before the blocks
        opened = utc_now() - timedelta(seconds=2)
        
        session.add(ReconciliationCase(case_id="c1", exception_code="X", severity="HIGH", expected_paisa=0, actual_paisa=0, delta_paisa=0, confidence_score=0, explanation="", suggested_action="", opened_at=opened))
        session.add(ReconciliationCase(case_id="c2", exception_code="X", severity="HIGH", expected_paisa=0, actual_paisa=0, delta_paisa=0, confidence_score=0, explanation="", suggested_action="", opened_at=opened))
        session.add(ReconciliationCase(case_id="c3", exception_code="X", severity="HIGH", expected_paisa=0, actual_paisa=0, delta_paisa=0, confidence_score=0, explanation="", suggested_action="", opened_at=opened))
        
        session.add(ReconciliationCase(case_id="c4", exception_code="X", severity="HIGH", expected_paisa=0, actual_paisa=0, delta_paisa=0, confidence_score=0, explanation="", suggested_action="", opened_at=utc_now() - timedelta(minutes=5)))
        session.add(ReconciliationCase(case_id="c5", exception_code="X", severity="HIGH", expected_paisa=0, actual_paisa=0, delta_paisa=0, confidence_score=0, explanation="", suggested_action="", opened_at=utc_now() - timedelta(minutes=5)))
        session.add(ReconciliationCase(case_id="c6", exception_code="X", severity="HIGH", expected_paisa=0, actual_paisa=0, delta_paisa=0, confidence_score=0, explanation="", suggested_action="", opened_at=utc_now() - timedelta(minutes=5)))
        session.commit()
        
        # Synthetic fast approver (rubber stamp + fast)
        for i in range(1, 4):
            session.add(AuditBlock(
                index=i,
                case_id=f"c{i}",
                reviewer="fast@test.com",
                action="APPROVE",
                reason="ok",
                payload_snapshot="{}",
                previous_hash="0",
                block_hash="0",
                timestamp=utc_now().isoformat()
            ))
            
        # Normal reviewer (longer time, varied actions)
        for i in range(4, 7):
            session.add(AuditBlock(
                index=i+3,
                case_id=f"c{i}",
                reviewer="normal@test.com",
                action="REJECT" if i == 4 else "APPROVE",
                reason="checked",
                payload_snapshot="{}",
                previous_hash="0",
                block_hash="0",
                timestamp=utc_now().isoformat()
            ))
            
        session.commit()
        
        risk_report = evaluate_reviewer_risk(session)
        
        assert risk_report["total_reviewers_analyzed"] == 2
        anomalies = risk_report["anomalous_reviewers"]
        assert len(anomalies) == 1
        assert anomalies[0]["reviewer"] == "fast@test.com"
        assert anomalies[0]["risk_level"] == "HIGH"
        assert anomalies[0]["rubber_stamp_rate"] == 1.0
