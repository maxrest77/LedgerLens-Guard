import sys
import hashlib
from sqlmodel import Session, select
from backend.db.init import engine
from backend.data.schema import Reviewer, RefreshToken, ReconciliationCase, ApprovalRequest, ToleranceRule, Incident

from backend.audit.chain import get_pii_hash

def erase_principal(session: Session, email: str) -> bool:
    reviewer = session.exec(select(Reviewer).where(Reviewer.email == email)).first()
    if not reviewer:
        return False
        
    pseudonym = get_pii_hash(email)
    
    # 1. Delete refresh tokens
    tokens = session.exec(select(RefreshToken).where(RefreshToken.reviewer_email == email)).all()
    for t in tokens:
        session.delete(t)
        
    # 2. Update all records referencing the email
    cases_resolved = session.exec(select(ReconciliationCase).where(ReconciliationCase.resolved_by == email)).all()
    for c in cases_resolved:
        c.resolved_by = pseudonym
        session.add(c)
        
    cases_coreviewed = session.exec(select(ReconciliationCase).where(ReconciliationCase.co_reviewer_email == email)).all()
    for c in cases_coreviewed:
        c.co_reviewer_email = pseudonym
        session.add(c)
        
    approvals_made = session.exec(select(ApprovalRequest).where(ApprovalRequest.maker_id == email)).all()
    for a in approvals_made:
        a.maker_id = pseudonym
        session.add(a)
        
    approvals_checked = session.exec(select(ApprovalRequest).where(ApprovalRequest.checker_id == email)).all()
    for a in approvals_checked:
        a.checker_id = pseudonym
        session.add(a)
        
    rules_proposed = session.exec(select(ToleranceRule).where(ToleranceRule.proposed_by == email)).all()
    for r in rules_proposed:
        r.proposed_by = pseudonym
        session.add(r)
        
    rules_approved = session.exec(select(ToleranceRule).where(ToleranceRule.approved_by == email)).all()
    for r in rules_approved:
        r.approved_by = pseudonym
        session.add(r)
        
    incidents = session.exec(select(Incident).where(Incident.owner == email)).all()
    for i in incidents:
        i.owner = pseudonym
        session.add(i)
        
    # 3. Handle Reviewer PK (delete and recreate to maintain constraints without cascading issues)
    erased_reviewer = Reviewer(
        email=pseudonym,
        hashed_password="[ERASED]",
        role=reviewer.role,
        portfolio_id=reviewer.portfolio_id
    )
    session.delete(reviewer)
    session.flush() # Delete the old one
    session.add(erased_reviewer)
    return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python dpdp_erasure.py <email>")
        sys.exit(1)
    
    email = sys.argv[1]
    with Session(engine) as session:
        if erase_principal(session, email):
            session.commit()
            print(f"Erasure complete for {email}.")
        else:
            print(f"Principal {email} not found.")
