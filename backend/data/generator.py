import random
import uuid
from datetime import datetime, timedelta
from typing import List, Tuple
from backend.data.schema import (
    Payment, Refund, Settlement, SettlementPaymentLink, Adjustment, BankEntry,
    PaymentMethod, PaymentStatus, AdjustmentType,
)
from backend.engine.fee_table import calculate_fee_paisa, calculate_tax_paisa

# ── Constants ────────────────────────────────────────────────────────────────
MERCHANT_ID = "merch_101"
BASE_DATE = datetime(2026, 8, 1)
SEED = 42  # Reproducible synthetic data


def _generate_ip() -> str:
    """Generate a realistic-looking public IP address."""
    return f"{random.randint(10, 223)}.{random.randint(0, 255)}.{random.randint(0, 255)}.{random.randint(1, 254)}"


def _date_for_day(day_index: int) -> datetime:
    """Returns a base datetime for a specific day index (1-10)."""
    return BASE_DATE + timedelta(days=day_index)


def _create_payment(day_index: int, amount_paisa: int | None = None, method: PaymentMethod | None = None) -> Payment:
    pid = f"pay_{uuid.uuid4().hex[:12]}"
    amt = amount_paisa or random.randint(10_000, 5_000_000)  # ₹100 – ₹50,000
    meth = method or random.choice(list(PaymentMethod))

    # IP clustering anomaly on spike days (8-9): 80% chance of the same IP
    if day_index in (8, 9) and random.random() < 0.8:
        ip = "192.168.100.42"  # Fixed valid IP for clustering signal
    else:
        ip = _generate_ip()

    return Payment(
        payment_id=pid,
        order_id=f"ord_{uuid.uuid4().hex[:10]}",
        merchant_id=MERCHANT_ID,
        amount_paisa=amt,
        payment_method=meth,
        status=PaymentStatus.CAPTURED,
        captured_at=_date_for_day(day_index) + timedelta(hours=random.randint(0, 23), minutes=random.randint(0, 59)),
        originating_ip=ip,
        customer_id=f"cust_{uuid.uuid4().hex[:8]}",
        bank_code=random.choice(["HDFC", "ICIC", "SBIN", "UTIB"]),
    )


def generate_dataset(
    seed: int = SEED,
) -> Tuple[List[Payment], List[Refund], List[Settlement], List[SettlementPaymentLink], List[BankEntry], List[Adjustment]]:
    """
    Generate a reproducible 400-record synthetic dataset.

    Timestamp distribution (critical for velocity signal):
    - Days 1-7: normal volume (~15/day) = ~105
    - Days 8-9: deliberate spike cluster (~60/day) = ~120
    - Day 10 : return to normal (~25) = ~25
    Total ≈ 250 payments
    """
    random.seed(seed)

    payments: List[Payment] = []
    refunds: List[Refund] = []
    settlements: List[Settlement] = []
    links: List[SettlementPaymentLink] = []
    bank_entries: List[BankEntry] = []
    adjustments: List[Adjustment] = []

    # ── 1. Payments (250) ────────────────────────────────────────────────
    day_distribution = [15] * 7 + [60, 60] + [25]
    for day, count in enumerate(day_distribution, start=1):
        for _ in range(count):
            payments.append(_create_payment(day))

    # ── 2. Refunds (40) ─────────────────────────────────────────────────
    refund_targets = random.sample(payments, 40)
    for i, p in enumerate(refund_targets):
        is_full = i < 30
        amt = p.amount_paisa if is_full else p.amount_paisa // 2
        p.status = PaymentStatus.REFUNDED if is_full else PaymentStatus.PARTIALLY_REFUNDED

        refund = Refund(
            refund_id=f"rfnd_{uuid.uuid4().hex[:12]}",
            payment_id=p.payment_id,
            amount_paisa=amt,
            status="PROCESSED",
            processed_at=p.captured_at + timedelta(hours=random.randint(1, 48)),
        )

        # Seed REFUND_WITHOUT_PAYMENT (2 instances) — each gets a unique fake ID
        if i == 0:
            refund.payment_id = f"pay_phantom_{uuid.uuid4().hex[:8]}"
        elif i == 1:
            refund.payment_id = f"pay_phantom_{uuid.uuid4().hex[:8]}"

        refunds.append(refund)

    # ── 3. Settlements (batches of 3-6 payments) ────────────────────────
    # Leave last 10 payments unsettled → MISSING_SETTLEMENT seeds
    payments_to_settle = payments[:-10]
    idx = 0
    settlement_num = 0

    while idx < len(payments_to_settle):
        batch_size = random.randint(3, 6)
        batch = payments_to_settle[idx : idx + batch_size]
        idx += batch_size
        if not batch:
            break

        settlement_num += 1
        setl_id = f"setl_{settlement_num:05d}"
        utr = f"HDFC202608{settlement_num:08d}"

        gross = 0
        fee = 0
        for p in batch:
            gross += p.amount_paisa
            fee += calculate_fee_paisa(p.payment_method, p.amount_paisa)
            links.append(SettlementPaymentLink(settlement_id=setl_id, payment_id=p.payment_id))

        tax = calculate_tax_paisa(fee)

        # Seed FEE_RATE_MISMATCH (3 instances): inflate the reported fee
        if settlement_num in (9, 19, 29):
            fee += 5000  # ₹50 deliberate inflation

        net = gross - fee - tax

        # Seed SETTLEMENT_ON_HOLD (2 instances)
        on_hold = settlement_num in (39, 49)

        settled_date = max(p.captured_at for p in batch) + timedelta(days=2)

        settlements.append(
            Settlement(
                settlement_id=setl_id,
                utr=utr,
                gross_paisa=gross,
                fee_paisa=fee,
                tax_paisa=tax,
                net_paisa=net,
                settled_at=settled_date,
                on_hold=on_hold,
            )
        )

        # Seed MISSING_BANK_CREDIT (4 instances): skip bank entry entirely
        if settlement_num in (4, 14, 24, 34):
            continue

        bank_amount = net

        # Seed BANK_CREDIT_SHORTFALL (8 instances)
        if settlement_num in (1, 3, 5, 7, 11, 13, 15, 17):
            if settlement_num in (1, 7, 13):
                # Small rounding error < ₹5 to trigger auto-resolution
                bank_amount -= random.randint(50, 450)
            else:
                bank_amount -= random.randint(1_000, 50_000)  # ₹10 – ₹500 shortfall

        bank_entries.append(
            BankEntry(
                utr=utr,
                amount_paisa=bank_amount,
                value_date=settled_date.date() + timedelta(days=1),
                description="NEFT/RAZORPAY SETTLEMENT",
                bank_reference=f"REF{uuid.uuid4().hex[:8].upper()}",
            )
        )

        # Seed DUPLICATE_UTR (3 instances): second bank entry for the same UTR
        if settlement_num in (6, 16, 26):
            bank_entries.append(
                BankEntry(
                    utr=utr,
                    amount_paisa=bank_amount,
                    value_date=settled_date.date() + timedelta(days=1),
                    description="DUPLICATE PROCESSING",
                    bank_reference=f"REF{uuid.uuid4().hex[:8].upper()}",
                )
            )

    # ── 4. Adjustments (10) ──────────────────────────────────────────────
    for i in range(min(10, len(settlements))):
        adjustments.append(
            Adjustment(
                adjustment_id=f"adj_{uuid.uuid4().hex[:8]}",
                settlement_id=settlements[i].settlement_id,
                type=AdjustmentType.TDS if i % 2 == 0 else AdjustmentType.CHARGEBACK,
                amount_paisa=random.randint(5_000, 20_000),
                reason="TDS Deduction" if i % 2 == 0 else "Customer Chargeback",
                created_at=settlements[i].settled_at,
            )
        )

    return payments, refunds, settlements, links, bank_entries, adjustments


if __name__ == "__main__":
    p, r, s, l, b, a = generate_dataset()
    print(
        f"Generated: {len(p)} payments, {len(r)} refunds, "
        f"{len(s)} settlements, {len(b)} bank entries, {len(a)} adjustments"
    )
