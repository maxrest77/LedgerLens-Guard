import os
from sqlmodel import Session
from passlib.context import CryptContext
from backend.db.init import engine, init_db
from backend.data.generator import generate_dataset, generate_gateway_dataset
from backend.data.schema import Reviewer

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def seed_db():
    # First ensure schema is created
    init_db()
    
    with Session(engine) as session:
        # Check if already seeded
        from sqlmodel import select
        existing = session.exec(select(Reviewer)).first()
        if existing:
            print("Database already seeded. Skipping.")
            return

        print("Seeding database with synthetic 400-record batch...")
        payments, refunds, settlements, links, bank_entries, adjustments = generate_dataset()
        
        session.add_all(payments)
        
        from backend.data.schema import ToleranceRule
        from backend.utils.time_utils import utc_now
        tolerance = ToleranceRule(
            parameter_name="AUTO_RESOLVE_THRESHOLD_PAISA",
            threshold_value=500,
            status="ACTIVE",
            effective_from=utc_now(),
            proposed_by="system",
            approved_by="system",
            reason="Initial seeding"
        )
        session.add(tolerance)
        session.add_all(refunds)
        session.add_all(settlements)
        session.add_all(links)
        session.add_all(bank_entries)
        session.add_all(adjustments)

        print("Seeding PrismPay synthetic dataset...")
        pu_p, pu_r, pu_s, pu_l, pu_b, pu_a = generate_gateway_dataset("PRISMPAY", seed=202, payment_count=50, fee_rate_multiplier=0.96, fee_inflation_instances=[3, 7])
        session.add_all(pu_p + pu_s + pu_l + pu_b)

        print("Seeding ClearSettle synthetic dataset...")
        cf_p, cf_r, cf_s, cf_l, cf_b, cf_a = generate_gateway_dataset("CLEARSETTLE", seed=303, payment_count=60, fee_rate_multiplier=0.88, fee_inflation_instances=[])
        session.add_all(cf_p + cf_s + cf_l + cf_b)
        
        print("Seeding reviewer accounts...")
        reviewer1_email = os.getenv("REVIEWER_1_EMAIL", "reviewer@ledgerlens.dev")
        reviewer1_pass = os.getenv("REVIEWER_1_PASSWORD", "demo_reviewer_2024")
        reviewer2_email = os.getenv("REVIEWER_2_EMAIL", "admin@ledgerlens.dev")
        reviewer2_pass = os.getenv("REVIEWER_2_PASSWORD", "demo_admin_2024")
        
        session.add(Reviewer(
            email=reviewer1_email,
            hashed_password=pwd_context.hash(reviewer1_pass),
            role="REVIEWER"
        ))
        session.add(Reviewer(
            email=reviewer2_email,
            hashed_password=pwd_context.hash(reviewer2_pass),
            role="ADMIN"
        ))
        
        session.commit()
        print("Database seeded successfully with Admin and Reviewer roles.")

        print("Running initial reconciliation batch...")
        from backend.engine.reconciler import reconcile_batch
        reconcile_batch(session)
        print("Reconciliation batch complete.")

        print("Enriching cases with enterprise portfolios, timeline spread, and maker-checker approval queue...")
        from backend.data.schema import ReconciliationCase, CaseStatus, ApprovalRequest
        from datetime import timedelta
        import hashlib

        all_cases = session.exec(select(ReconciliationCase)).all()
        portfolios = ["ENTERPRISE_CORE", "ECOMMERCE_RETAIL", "FINTECH_WALLETS", "GLOBAL_CARDS", "CROSS_BORDER"]
        now = utc_now()

        # Deterministically partition cases across portfolios and spread dates over 45 days
        for idx, c in enumerate(all_cases):
            c.portfolio_id = portfolios[idx % len(portfolios)]
            # Spread opened_at over 45 days
            days_ago = (idx * 7) % 45
            hours_ago = (idx * 3) % 24
            c.opened_at = now - timedelta(days=days_ago, hours=hours_ago)
            session.add(c)

        session.commit()

        # Seed realistic lifecycle statuses:
        # Non-auto-resolved cases: designate 4 PENDING_CO_REVIEW, 2 ESCALATED, 8 APPROVED, 2 REJECTED
        non_auto = [c for c in all_cases if c.status != CaseStatus.AUTO_RESOLVED]
        
        # 4 PENDING_CO_REVIEW
        for c in non_auto[:4]:
            c.status = CaseStatus.PENDING_CO_REVIEW
            c.resolved_by = reviewer1_email
            session.add(c)
            # Add ApprovalRequest
            existing_req = session.exec(select(ApprovalRequest).where(ApprovalRequest.case_id == c.case_id)).first()
            if not existing_req:
                req = ApprovalRequest(
                    case_id=c.case_id,
                    maker_id=reviewer1_email,
                    proposed_action="APPROVE",
                    reason="Standard tolerance variance within expected threshold, requesting checker sign-off.",
                    status="PENDING",
                    created_at=c.opened_at + timedelta(hours=2)
                )
                session.add(req)

        # 2 ESCALATED
        for c in non_auto[4:6]:
            c.status = CaseStatus.ESCALATED
            c.resolved_by = reviewer1_email
            session.add(c)
            existing_req = session.exec(select(ApprovalRequest).where(ApprovalRequest.case_id == c.case_id)).first()
            if not existing_req:
                req = ApprovalRequest(
                    case_id=c.case_id,
                    maker_id=reviewer1_email,
                    proposed_action="REJECT",
                    reason="Suspected gateway settlement shortfall requires administrative escalation and investigation.",
                    status="PENDING",
                    created_at=c.opened_at + timedelta(hours=3)
                )
                session.add(req)

        # 8 APPROVED
        for c in non_auto[6:14]:
            c.status = CaseStatus.APPROVED
            c.resolved_by = reviewer2_email
            c.resolved_at = c.opened_at + timedelta(hours=4)
            session.add(c)

        # 2 REJECTED
        for c in non_auto[14:16]:
            c.status = CaseStatus.REJECTED
            c.resolved_by = reviewer2_email
            c.resolved_at = c.opened_at + timedelta(hours=5)
            session.add(c)

        session.commit()

        # Seed statutory DPDP erasure compliance logs (Task 10.2)
        print("Seeding statutory DPDP erasure compliance logs...")
        from backend.data.schema import DPDPErasureRecord
        from backend.audit.chain import append_to_chain, verify_chain

        erased_reviewer = session.exec(select(Reviewer).where(Reviewer.email == "usr_erased_hash_9988@ledgerlens.internal")).first()
        if not erased_reviewer:
            erased_reviewer = Reviewer(
                email="usr_erased_hash_9988@ledgerlens.internal",
                hashed_password="[ERASED]",
                role="REVIEWER",
                portfolio_id="ENTERPRISE_CORE"
            )
            session.add(erased_reviewer)

        existing_erasures = session.exec(select(DPDPErasureRecord)).all()
        if not existing_erasures:
            erasure_fixtures = [
                ("ERA-2026-0001", "usr_8f9a2c41b80e4129", 25, 24, 14),
                ("ERA-2026-0002", "usr_e3b0c44298fc1c14", 21, 20, 8),
                ("ERA-2026-0003", "usr_c71667e41b99a0e2", 17, 16, 22),
                ("ERA-2026-0004", "usr_4a8d9b1c33ef2817", 13, 12, 6),
                ("ERA-2026-0005", "usr_1029384756abcdef", 8, 7, 18),
                ("ERA-2026-0006", "usr_9988776655443322", 3, 2, 11),
            ]
            for era_id, subj_hash, req_days, comp_days, blk_count in erasure_fixtures:
                session.add(DPDPErasureRecord(
                    erasure_id=era_id,
                    subject_id=subj_hash,
                    request_date=now - timedelta(days=req_days, hours=2),
                    completed_date=now - timedelta(days=comp_days, hours=1),
                    blocks_pseudonym_verified_count=blk_count,
                    dpdp_section_reference="Section 12(1) — Right to Erasure, DPDP Act 2023",
                    verification_status="VERIFIED"
                ))
            session.commit()

        # Seed administrative cross-portfolio override audit blocks (Task 10.3)
        print("Seeding administrative cross-portfolio override audit blocks...")
        from backend.audit.chain import AuditBlock
        existing_overrides = session.exec(select(AuditBlock).where(AuditBlock.action == "ADMIN_CROSS_PORTFOLIO_OVERRIDE")).all()
        if not existing_overrides:
            override_fixtures = [
                (non_auto[0].case_id, "ENTERPRISE_CORE", 23, "Administrative escalation outside standard portfolio: high-exposure NEFT settlement variance rerouted to priority treasury queue."),
                (non_auto[1].case_id, "ECOMMERCE_RETAIL", 18, "Cross-portfolio override authorized under dual-control policy: threshold discrepancy re-classified after bank advice confirmation."),
                (non_auto[2].case_id, "FINTECH_WALLETS", 14, "Executive emergency sign-off: escalated cross-portfolio for priority clearance per RBI Cyber Security Framework Section 3.4."),
                (non_auto[3].case_id, "GLOBAL_CARDS", 9, "Senior Administrator intervention: multi-currency chargeback dispute transferred across portfolio boundary."),
                (non_auto[4].case_id, "CROSS_BORDER", 4, "Compliance mandate override: administrative settlement freeze lifted following statutory auditor concurrence."),
            ]
            for case_id, port_id, days_ago, justif in override_fixtures:
                append_to_chain(
                    session=session,
                    case_id=case_id,
                    reviewer=reviewer2_email,
                    action="ADMIN_CROSS_PORTFOLIO_OVERRIDE",
                    reason=justif,
                    payload_snapshot={
                        "portfolio_id": port_id,
                        "reviewer": reviewer2_email,
                        "original_status": "OPEN",
                        "overridden_status": "ESCALATED",
                        "justification": justif
                    },
                    timestamp=(now - timedelta(days=days_ago, hours=2)).isoformat()
                )
            session.commit()

        chain_res = verify_chain(session)
        print(f"Audit chain verified: {chain_res['valid']}")

        print("Database enrichment complete. All live metrics, portfolios, and approval queues ready.")

if __name__ == "__main__":
    seed_db()
