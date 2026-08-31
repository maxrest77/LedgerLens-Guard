import uuid
import hashlib
from datetime import datetime
from collections import defaultdict
from typing import List
from sqlmodel import Session, select
from backend.data.schema import (
    Payment, Refund, Settlement, BankEntry, Adjustment, SettlementPaymentLink,
    ReconciliationCase, CaseStatus,
)
from backend.engine.exception_classifier import classify_exceptions
from backend.engine.match_scorer import calculate_match_confidence
from backend.engine.explanation_engine import generate_explanation, get_suggested_action
from backend.audit.chain import append_to_chain

def _generate_case_id(code: str, settlement_id: str | None, payment_id: str | None, utr: str | None, expected: int, actual: int) -> str:
    if code == "SYSTEMATIC_FEE_DEVIATION":
        key_str = f"{code}:group:{expected - actual}"
    else:
        key_str = f"{code}:{settlement_id}:{payment_id}:{utr}"
    case_hash = hashlib.sha256(key_str.encode("utf-8")).hexdigest()[:12]
    return f"case_{case_hash}"

def _build_case(
    code: str,
    severity: str,
    expected: int,
    actual: int,
    confidence: float,
    ctx: dict,
    settlement_id: str | None = None,
    payment_id: str | None = None,
    utr: str | None = None,
) -> ReconciliationCase:
    case_id = _generate_case_id(code, settlement_id, payment_id, utr, expected, actual)
    return ReconciliationCase(
        case_id=case_id,
        exception_code=code,
        severity=severity,
        settlement_id=settlement_id,
        payment_id=payment_id,
        utr=utr,
        expected_paisa=expected,
        actual_paisa=actual,
        delta_paisa=expected - actual,
        confidence_score=confidence,
        explanation=generate_explanation(code, ctx),
        suggested_action=get_suggested_action(code),
        status=CaseStatus.OPEN,
        opened_at=datetime.utcnow(),
    )

def reconcile_batch(session: Session) -> List[ReconciliationCase]:
    # Fetch existing cases instead of wiping
    existing_cases = session.exec(select(ReconciliationCase)).all()
    existing_case_map = {c.case_id: c for c in existing_cases}

    payments = session.exec(select(Payment)).all()
    refunds = session.exec(select(Refund)).all()
    settlements = session.exec(select(Settlement)).all()
    links = session.exec(select(SettlementPaymentLink)).all()
    bank_entries = session.exec(select(BankEntry)).all()
    adjustments = session.exec(select(Adjustment)).all()

    new_cases: List[ReconciliationCase] = []

    # ── Global check 1: DUPLICATE_UTR ────────────────────────────────────
    utr_counts: dict[str, int] = defaultdict(int)
    for b in bank_entries:
        utr_counts[b.utr] += 1
    for utr, count in utr_counts.items():
        if count > 1:
            bank_amts = [b.amount_paisa for b in bank_entries if b.utr == utr]
            new_cases.append(
                _build_case(
                    code="DUPLICATE_UTR",
                    severity="CRITICAL",
                    utr=utr,
                    expected=bank_amts[0],
                    actual=sum(bank_amts),
                    confidence=1.0,
                    ctx={"utr": utr},
                )
            )

    # ── Global check 2: REFUND_WITHOUT_PAYMENT ───────────────────────────
    payment_ids = {p.payment_id for p in payments}
    for r in refunds:
        if r.payment_id not in payment_ids:
            new_cases.append(
                _build_case(
                    code="REFUND_WITHOUT_PAYMENT",
                    severity="CRITICAL",
                    payment_id=r.payment_id,
                    expected=r.amount_paisa,
                    actual=0,
                    confidence=1.0,
                    ctx={"refund_id": r.refund_id, "payment_id": r.payment_id},
                )
            )

    # ── Global check 3: ADJUSTMENT_UNMATCHED ─────────────────────────────
    settlement_ids = {s.settlement_id for s in settlements}
    for a in adjustments:
        if a.settlement_id not in settlement_ids:
            new_cases.append(
                _build_case(
                    code="ADJUSTMENT_UNMATCHED",
                    severity="MEDIUM",
                    expected=a.amount_paisa,
                    actual=0,
                    confidence=1.0,
                    ctx={"adjustment_id": a.adjustment_id, "delta": a.amount_paisa},
                )
            )

    # ── Build lookup maps ────────────────────────────────────────────────
    link_map: dict[str, list[str]] = defaultdict(list)
    for link in links:
        link_map[link.settlement_id].append(link.payment_id)

    payment_map = {p.payment_id: p for p in payments}

    refund_map: dict[str, list[Refund]] = defaultdict(list)
    for r in refunds:
        refund_map[r.payment_id].append(r)

    bank_map: dict[str, BankEntry] = {}
    for b in bank_entries:
        if b.utr not in bank_map:
            bank_map[b.utr] = b

    adj_map: dict[str, list[Adjustment]] = defaultdict(list)
    for a in adjustments:
        adj_map[a.settlement_id].append(a)

    processed_payments: set[str] = set()

    # ── Per-settlement batch processing ──────────────────────────────────
    for s in settlements:
        batch_pids = link_map.get(s.settlement_id, [])
        batch_payments = [payment_map[pid] for pid in batch_pids if pid in payment_map]
        processed_payments.update(batch_pids)

        batch_refunds: list[Refund] = []
        for pid in batch_pids:
            batch_refunds.extend(refund_map.get(pid, []))

        batch_adjs = adj_map.get(s.settlement_id, [])
        b_entry = bank_map.get(s.utr)

        adj_total = sum(a.amount_paisa for a in batch_adjs)
        expected_net = s.net_paisa - adj_total

        p1 = batch_payments[0] if batch_payments else None
        confidence = calculate_match_confidence(p1, s, b_entry, expected_net)

        if confidence < 0.50:
            actual = b_entry.amount_paisa if b_entry else 0
            new_cases.append(
                _build_case(
                    code="UNMATCHED",
                    severity="HIGH",
                    settlement_id=s.settlement_id,
                    utr=s.utr,
                    expected=expected_net,
                    actual=actual,
                    confidence=confidence,
                    ctx={},
                )
            )
            continue

        exceptions = classify_exceptions(s, b_entry, batch_payments, batch_refunds, batch_adjs)
        for ex in exceptions:
            ctx = {
                "settlement_id": s.settlement_id,
                "utr": s.utr,
                "payment_count": len(batch_payments),
                "expected_net": ex.expected,
                "actual_credit": ex.actual,
                "delta": ex.delta,
                "fee": s.fee_paisa,
                "tax": s.tax_paisa,
                "date": s.settled_at.date().isoformat(),
            }
            if p1:
                ctx["method"] = p1.payment_method.value

            new_cases.append(
                _build_case(
                    code=ex.code,
                    severity=ex.severity,
                    settlement_id=s.settlement_id,
                    utr=s.utr,
                    expected=ex.expected,
                    actual=ex.actual,
                    confidence=confidence,
                    ctx=ctx,
                )
            )

    # ── Unprocessed payments → MISSING_SETTLEMENT ────────────────────────
    now = datetime.utcnow()
    for p in payments:
        if p.payment_id not in processed_payments:
            if (now - p.captured_at).days > 3:
                new_cases.append(
                    _build_case(
                        code="MISSING_SETTLEMENT",
                        severity="HIGH",
                        payment_id=p.payment_id,
                        expected=p.amount_paisa,
                        actual=0,
                        confidence=0.0,
                        ctx={
                            "payment_id": p.payment_id,
                            "expected_net": p.amount_paisa,
                            "date": p.captured_at.date().isoformat(),
                        },
                    )
                )

    # ── Pattern Detection & Auto-Resolution ─────────────────────────────
    
    # Auto-resolve small differences
    for c in new_cases:
        if c.severity != "CRITICAL" and abs(c.delta_paisa) <= 500 and abs(c.delta_paisa) > 0:
            c.status = CaseStatus.AUTO_RESOLVED
            c.explanation = f"Auto-resolved due to tolerance (< ₹5). Original delta: {c.delta_paisa / 100:.2f}."
            c.suggested_action = "NO_ACTION_REQUIRED"
            c.resolved_at = datetime.utcnow()
            c.resolved_by = "system_auto_resolve"

    groups = defaultdict(list)
    for c in new_cases:
        if c.status == CaseStatus.OPEN and c.delta_paisa != 0:
            groups[(c.exception_code, c.delta_paisa)].append(c)
    
    generated_cases = []
    for (code, delta), group_cases in groups.items():
        if len(group_cases) >= 3:
            total_expected = sum(c.expected_paisa for c in group_cases)
            total_actual = sum(c.actual_paisa for c in group_cases)
            generated_cases.append(
                _build_case(
                    code="SYSTEMATIC_FEE_DEVIATION",
                    severity="HIGH",
                    expected=total_expected,
                    actual=total_actual,
                    confidence=0.95,
                    ctx={
                        "batch_count": len(group_cases),
                        "expected_net": total_expected,
                        "actual_credit": total_actual,
                        "delta": total_expected - total_actual,
                    }
                )
            )
        else:
            generated_cases.extend(group_cases)
            
    for c in new_cases:
        if c.status != CaseStatus.OPEN or c.delta_paisa == 0:
            generated_cases.append(c)

    # ── Merge with Existing Cases (A1) ──────────────────────────────────
    final_cases = []
    cases_to_audit_recompute = []
    cases_to_audit_autoresolve = []

    for c_new in generated_cases:
        existing = existing_case_map.get(c_new.case_id)
        if existing:
            facts_changed = (existing.expected_paisa != c_new.expected_paisa or 
                             existing.actual_paisa != c_new.actual_paisa)
            
            if facts_changed:
                had_human_decision = existing.status in [CaseStatus.APPROVED, CaseStatus.REJECTED, CaseStatus.ESCALATED]
                old_facts = existing.model_dump(mode="json")
                
                existing.expected_paisa = c_new.expected_paisa
                existing.actual_paisa = c_new.actual_paisa
                existing.delta_paisa = c_new.delta_paisa
                existing.explanation = c_new.explanation
                existing.severity = c_new.severity
                existing.confidence_score = c_new.confidence_score
                existing.suggested_action = c_new.suggested_action
                
                if had_human_decision:
                    existing.status = CaseStatus.OPEN
                    existing.resolved_at = None
                    existing.resolved_by = None
                    cases_to_audit_recompute.append((existing, old_facts))
                else:
                    existing.status = c_new.status
                    existing.resolved_at = c_new.resolved_at
                    existing.resolved_by = c_new.resolved_by
                    if c_new.status == CaseStatus.AUTO_RESOLVED:
                        cases_to_audit_autoresolve.append(existing)
                
                final_cases.append(existing)
            else:
                # Facts didn't change, preserve exactly as is
                final_cases.append(existing)
            
            del existing_case_map[c_new.case_id]
        else:
            # Entirely new case
            final_cases.append(c_new)
            if c_new.status == CaseStatus.AUTO_RESOLVED:
                cases_to_audit_autoresolve.append(c_new)

    # Any remaining cases in existing_case_map are no longer applicable
    for c_to_delete in existing_case_map.values():
        session.delete(c_to_delete)

    session.add_all(final_cases)
    session.commit()
    
    # Write automated decisions and recomputes to the audit chain
    for c_existing, old_facts in cases_to_audit_recompute:
        session.refresh(c_existing)
        block = append_to_chain(
            session=session,
            case_id=c_existing.case_id,
            reviewer="system_reconciler",
            action="CASE_RECOMPUTED",
            reason="Underlying financial facts changed",
            payload_snapshot={"old": old_facts, "new": c_existing.model_dump(mode="json")}
        )
        c_existing.audit_block_id = block.index
        session.add(c_existing)
        
    for c_auto in cases_to_audit_autoresolve:
        session.refresh(c_auto)
        block = append_to_chain(
            session=session,
            case_id=c_auto.case_id,
            reviewer=c_auto.resolved_by,
            action="AUTO_RESOLVE",
            reason=c_auto.explanation,
            payload_snapshot=c_auto.model_dump(mode="json"),
        )
        c_auto.audit_block_id = block.index
        session.add(c_auto)
    
    if cases_to_audit_recompute or cases_to_audit_autoresolve:
        session.commit()

    return final_cases
