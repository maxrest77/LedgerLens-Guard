import uuid
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


def reconcile_batch(session: Session) -> List[ReconciliationCase]:
    """
    Main reconciliation loop:
    1. Loads all records from DB.
    2. Groups by settlement batch (SettlementPaymentLink + UTR).
    3. Runs exception classification per batch.
    4. Detects global-level exceptions (DUPLICATE_UTR, REFUND_WITHOUT_PAYMENT, etc.).
    5. Persists ReconciliationCase rows.

    Idempotent: clears any existing cases before re-running.
    """
    # ── Idempotency: wipe previous run's cases ───────────────────────────
    existing_cases = session.exec(select(ReconciliationCase)).all()
    for c in existing_cases:
        session.delete(c)
    session.commit()

    # ── Load all source records ──────────────────────────────────────────
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

    # For duplicate UTRs, bank_map keeps *first* entry per UTR.
    # Duplicate detection is already handled above.
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

        # Adjustments are debits (negative impact on what the merchant receives),
        # so they reduce the expected bank credit.
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

    # Pattern detection
    # Group OPEN cases by (exception_code, delta_paisa)
    groups = defaultdict(list)
    for c in new_cases:
        if c.status == CaseStatus.OPEN and c.delta_paisa != 0:
            groups[(c.exception_code, c.delta_paisa)].append(c)
    
    final_cases = []
    for (code, delta), group_cases in groups.items():
        if len(group_cases) >= 3:
            # Create a systematic case
            total_expected = sum(c.expected_paisa for c in group_cases)
            total_actual = sum(c.actual_paisa for c in group_cases)
            final_cases.append(
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
            # We don't add the original cases to final_cases
        else:
            final_cases.extend(group_cases)
            
    # Add back the auto-resolved cases and others that weren't grouped
    for c in new_cases:
        if c.status != CaseStatus.OPEN or c.delta_paisa == 0:
            final_cases.append(c)

    # ── Persist ──────────────────────────────────────────────────────────
    session.add_all(final_cases)
    session.commit()
    
    # Write automated decisions to the audit chain
    for c in final_cases:
        session.refresh(c)
        if c.status == CaseStatus.AUTO_RESOLVED:
            block = append_to_chain(
                session=session,
                case_id=c.case_id,
                reviewer=c.resolved_by,
                action="AUTO_RESOLVE",
                reason=c.explanation,
                payload_snapshot=c.model_dump(mode="json"),
            )
            c.audit_block_id = block.index
            session.add(c)
    
    session.commit()

    return final_cases


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
    return ReconciliationCase(
        case_id=f"case_{uuid.uuid4().hex[:12]}",
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
