import io
import re
import csv
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from backend.utils.time_utils import utc_now
from typing import Any, Dict, List, Optional, Tuple

from backend.engine.sanitizer import mask_pan_luhn, sanitize_payload_for_storage

# ── Header Normalization & Fuzzy Mappings ─────────────────────────────────────

def _clean_header(h: str) -> str:
    return re.sub(r'[^a-z0-9]', '', str(h).lower().strip())

_UTR_KEYS = {
    "utr", "rrn", "bankref", "bankreference", "referenceno", "refno", "reference",
    "txnid", "transactionid", "txnref", "txnreference", "paymentid", "orderid",
    "arn", "acquirerreference", "trace", "traceno", "externalid", "trackingid",
    "challanno", "docno", "documentno", "chequeno", "transid", "id"
}
_AMOUNT_KEYS = {
    "amount", "grossamount", "gross", "txnamount", "transactionamount", "credit",
    "creditamount", "deposit", "settlementamount", "originalamount", "totalamount",
    "total", "paidamount", "billingamount", "debit", "debitamount"
}
_FEE_KEYS = {
    "fee", "fees", "feeamount", "mdr", "commission", "charge", "charges",
    "processingfee", "gatewayfee", "conveniencefee", "deductions", "platformfee"
}
_TAX_KEYS = {
    "tax", "taxes", "gst", "igst", "cgst", "sgst", "servicetax", "vat", "tds",
    "withholding", "cess"
}
_NET_KEYS = {
    "net", "netamount", "netpaisa", "payout", "payoutamount", "settledamount",
    "settlednet", "transferamount", "netcredit", "amountcredited", "netpayable"
}
_DATE_KEYS = {
    "date", "timestamp", "datetime", "settledat", "capturedat", "txndate",
    "transactiondate", "valuedate", "postingdate", "settlementdate", "time",
    "bookingdate", "createdat"
}
_ACCOUNT_KEYS = {
    "account", "accountnumber", "accno", "accountno", "card", "cardnumber",
    "maskedcard", "pan", "vpa", "upi", "upiid", "customerid", "remitter",
    "beneficiary", "bankacc"
}
_NARRATIVE_KEYS = {
    "narrative", "description", "remarks", "details", "reason", "particulars",
    "notes", "status", "type", "mode", "channel", "comments"
}
_CURRENCY_KEYS = {"currency", "curr", "ccy"}

def _parse_currency_to_paisa(val: Any) -> int:
    """Safely converts string, number, or accounting formatted value to integer paisa ($1.00 = 100)."""
    if val is None:
        return 0
    if isinstance(val, (int, float)):
        import math
        if math.isnan(val) or math.isinf(val):
            return 0
        return int(round(val * 100))
    s = str(val).strip()
    if not s or s.lower() in ("nan", "none", "null", "-", "--", "nil", "n/a", "na"):
        return 0

    # Handle accounting brackets: e.g. (100.50) -> -100.50
    if s.startswith("(") and s.endswith(")"):
        s = "-" + s[1:-1]

    # Handle DR / CR postfixes
    is_debit = False
    if s.upper().endswith("DR"):
        is_debit = True
        s = s[:-2].strip()
    elif s.upper().endswith("CR"):
        s = s[:-2].strip()

    # Strip currency symbols and common thousands separators
    for sym in ("$", "₹", "€", "£", "INR", "USD", "EUR", "GBP", "Rs.", "Rs", "rs"):
        s = s.replace(sym, "")
    s = s.replace(",", "").strip()

    try:
        f = float(s)
        paisa = int(round(f * 100))
        return -abs(paisa) if is_debit else paisa
    except (ValueError, TypeError):
        return 0

def _parse_date_to_str(val: Any) -> Optional[str]:
    """Extracts a standardized YYYY-MM-DD or YYYY-MM-DD HH:MM:SS date string from cell values."""
    if val is None:
        return None
    from datetime import date as d_cls, datetime as dt_cls, timedelta
    if isinstance(val, dt_cls):
        if val.time() == dt_cls.min.time():
            return val.strftime("%Y-%m-%d")
        return val.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(val, d_cls):
        return val.strftime("%Y-%m-%d")
    if isinstance(val, (int, float)):
        if 20000 <= val <= 80000:
            try:
                base_date = dt_cls(1899, 12, 30)
                converted = base_date + timedelta(days=float(val))
                return converted.strftime("%Y-%m-%d")
            except Exception:
                pass
    s = str(val).strip()
    if not s or s.lower() in ("nan", "none", "null", "-", "nat"):
        return None
    if re.match(r'^\d{4}-\d{2}-\d{2}', s):
        return s[:19]
    for fmt in (
        "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%d-%b-%Y", "%d %b %Y", "%Y/%m/%d",
        "%B %d, %Y", "%b %d, %Y", "%d-%B-%Y", "%d %B %Y", "%B %d %Y", "%b %d %Y",
        "%d.%m.%Y", "%Y.%m.%d"
    ):
        try:
            return dt_cls.strptime(s, fmt).strftime("%Y-%m-%d")
        except Exception:
            pass
        try:
            return dt_cls.strptime(s.split()[0], fmt).strftime("%Y-%m-%d")
        except Exception:
            pass
    return s[:30]

# ── Delimited Parsers (CSV / TSV) ─────────────────────────────────────────────

def parse_delimited(content: bytes, filename: str) -> Dict[str, Any]:
    text_content = content.decode("utf-8", errors="replace")
    delimiter = "\t" if filename.lower().endswith(".tsv") else ","
    
    # Check if pipe or semicolon is used
    first_line = text_content.splitlines()[0] if text_content else ""
    if "|" in first_line and delimiter != "\t":
        delimiter = "|"
    elif ";" in first_line and delimiter != "\t" and "," not in first_line:
        delimiter = ";"
        
    reader = csv.reader(io.StringIO(text_content), delimiter=delimiter)
    rows = list(reader)
    if not rows:
        return {"records": [], "summary": {"total_records": 0, "total_amount_paisa": 0, "net_paisa": 0, "pci_masked_count": 0}}
        
    raw_headers = [h.strip() for h in rows[0]]
    cleaned_headers = [_clean_header(h) for h in raw_headers]
    
    col_map = {}
    for idx, h in enumerate(cleaned_headers):
        if (h in _DATE_KEYS or any(k in h for k in ("date", "time", "valdate", "timestamp", "settledat", "createdat"))) and "date" not in col_map:
            col_map["date"] = idx
        elif (h in _UTR_KEYS or any(k in h for k in ("utr", "rrn", "bankref", "refno", "txnid", "orderid", "paymentid", "transid", "docno"))) and "utr" not in col_map:
            col_map["utr"] = idx
        elif (h in _AMOUNT_KEYS or any(k in h for k in ("gross", "credit", "deposit", "totalamount", "paidamount")) or h == "amount") and "amount" not in col_map:
            col_map["amount"] = idx
        elif (h in _FEE_KEYS or any(k in h for k in ("fee", "mdr", "commiss", "charge"))) and "fee" not in col_map:
            col_map["fee"] = idx
        elif (h in _TAX_KEYS or any(k in h for k in ("tax", "gst", "tds", "vat"))) and "tax" not in col_map:
            col_map["tax"] = idx
        elif (h in _NET_KEYS or any(k in h for k in ("netamount", "payoutamount", "settledamount", "netcredit", "netpayable")) or h in ("net", "payout", "settled")) and "net" not in col_map:
            col_map["net"] = idx
        elif (h in _ACCOUNT_KEYS or any(k in h for k in ("card", "account", "acc", "pan", "vpa", "upi"))) and "account" not in col_map:
            col_map["account"] = idx
        elif (h in _NARRATIVE_KEYS or any(k in h for k in ("narrative", "desc", "remark", "particular", "note", "detail"))) and "narrative" not in col_map:
            col_map["narrative"] = idx

    records = []
    pci_masked_count = 0
    total_amount_paisa = 0
    total_net_paisa = 0

    for r_idx, row in enumerate(rows[1:], start=1):
        if not row or all(not cell.strip() for cell in row):
            continue

        def get_val(key: str) -> Optional[str]:
            if key in col_map and col_map[key] < len(row):
                return row[col_map[key]].strip()
            return None

        raw_account = get_val("account")
        masked_account = mask_pan_luhn(raw_account) if raw_account else None
        if raw_account and masked_account != raw_account:
            pci_masked_count += 1

        raw_narrative = get_val("narrative")
        masked_narrative = mask_pan_luhn(raw_narrative) if raw_narrative else None
        if raw_narrative and masked_narrative != raw_narrative:
            pci_masked_count += 1

        gross_paisa = _parse_currency_to_paisa(get_val("amount"))
        fee_paisa = _parse_currency_to_paisa(get_val("fee"))
        tax_paisa = _parse_currency_to_paisa(get_val("tax"))
        net_val = get_val("net")
        net_paisa = _parse_currency_to_paisa(net_val) if net_val else (gross_paisa - fee_paisa - tax_paisa)

        total_amount_paisa += gross_paisa
        total_net_paisa += net_paisa

        records.append({
            "record_index": r_idx,
            "utr": get_val("utr") or f"ROW_{r_idx}",
            "amount_paisa": gross_paisa,
            "fee_paisa": fee_paisa,
            "tax_paisa": tax_paisa,
            "net_paisa": net_paisa,
            "timestamp": get_val("date"),
            "masked_account_or_pan": masked_account,
            "narrative": masked_narrative or f"Delimited entry row #{r_idx}"
        })

    return {
        "records": records,
        "summary": {
            "total_records": len(records),
            "total_amount_paisa": total_amount_paisa,
            "net_amount_paisa": total_net_paisa,
            "pci_masked_count": pci_masked_count
        }
    }

# ── ISO 20022 camt.053 XML Parser ────────────────────────────────────────────

_INVALID_CAMT_REFS = {
    "", "notprovided", "none", "na", "null", "nan", "-", "--",
    "/notprovided/", "/none/", "/na/", "nil", "unknown", "n/a", "undefined"
}

def _clean_xml_element_tags(root: ET.Element) -> None:
    """Recursively strips XML namespaces from element tags in-place."""
    for elem in root.iter():
        if "}" in elem.tag:
            elem.tag = elem.tag.split("}", 1)[1]

def _is_valid_camt_ref(val: Optional[str]) -> bool:
    if not val:
        return False
    s = str(val).strip()
    return len(s) >= 3 and s.lower() not in _INVALID_CAMT_REFS

def _find_first_camt_text(elem: Optional[ET.Element], paths: List[str]) -> Optional[str]:
    if elem is None:
        return None
    for p in paths:
        txt = elem.findtext(p)
        if txt is not None and txt.strip():
            return txt.strip()
    return None

def _extract_ref_from_camt_narrative(text: Optional[str]) -> Optional[str]:
    if not text:
        return None
    m = re.search(r'\b((?:UTR|RRN|REF|TXN|ID|CR|DB)[_#\s-]*[A-Za-z0-9_-]{6,34})\b', text, re.IGNORECASE)
    if m:
        token = m.group(1).replace(" ", "")
        clean_tok = re.sub(r'^(?:UTR|RRN|REF|TXN|ID)[:#\s_-]+', '', token, flags=re.IGNORECASE)
        if _is_valid_camt_ref(clean_tok):
            return clean_tok
        if _is_valid_camt_ref(token):
            return token

    tokens = re.findall(r'\b[A-Za-z0-9_-]{8,34}\b', text)
    for tok in tokens:
        if any(c.isdigit() for c in tok) and not re.match(r'^\d{4}-\d{2}-\d{2}', tok) and tok.lower() not in _INVALID_CAMT_REFS:
            return tok
    return None

def _resolve_camt_reference(elem: ET.Element, parent_ntry: Optional[ET.Element], default_fallback: str) -> str:
    """
    Dynamically identifies the best available unique transaction reference from standard
    ISO 20022 fields in order of priority:
    1. EndToEndId (universal end-to-end transaction identifier)
    2. TxId (first agent/bank transaction identification)
    3. ClrSysRef (clearing system reference / central switch UTR)
    4. InstrId (payment instruction identification)
    5. AcctSvcrRef (account servicer reference)
    6. PmtInfId (payment information batch/instruction identification)
    7. MndtId (direct debit mandate ID)
    8. ChqNb (cheque number)
    9. Structured remittance creditor reference (CdtrRefInf/Ref, RfrdDocInf/Nb)
    10. Parent entry references (if currently in a TxDtls child)
    11. Extracted reference from unstructured remittance narrative
    12. Fallback to generated identifier (only when all above are absent/invalid)
    """
    ref_tags = ("EndToEndId", "TxId", "ClrSysRef", "InstrId", "AcctSvcrRef", "PmtInfId", "MndtId", "ChqNb")

    # 1. Check Refs container inside elem
    refs_elem = elem.find("Refs")
    if refs_elem is not None:
        for tag in ref_tags:
            val = refs_elem.findtext(tag)
            if _is_valid_camt_ref(val):
                return val.strip()

    # 2. Check direct child tags inside elem
    for tag in ref_tags:
        val = elem.findtext(tag)
        if _is_valid_camt_ref(val):
            return val.strip()

    # 3. Check Structured Remittance Information
    for path in (".//CdtrRefInf/Ref", ".//RfrdDocInf/Nb", ".//InvcgPtyRef", ".//InvceeRef"):
        val = elem.findtext(path)
        if _is_valid_camt_ref(val):
            return val.strip()

    # 4. Check parent Ntry references if elem is a child TxDtls
    if parent_ntry is not None and parent_ntry != elem:
        parent_refs = parent_ntry.find("Refs")
        if parent_refs is not None:
            for tag in ref_tags:
                val = parent_refs.findtext(tag)
                if _is_valid_camt_ref(val):
                    return val.strip()
        for tag in ref_tags:
            val = parent_ntry.findtext(tag)
            if _is_valid_camt_ref(val):
                return val.strip()

    # 5. Extract from Unstructured Remittance or Additional Info in elem
    for path in (".//Ustrd", ".//AddtlTxInf", ".//AddtlNtryInf"):
        txt = elem.findtext(path)
        if txt:
            ref = _extract_ref_from_camt_narrative(txt)
            if ref and _is_valid_camt_ref(ref):
                return ref

    # 6. Extract from Unstructured Remittance or Additional Info in parent Ntry
    if parent_ntry is not None and parent_ntry != elem:
        for path in (".//AddtlNtryInf", ".//Ustrd"):
            txt = parent_ntry.findtext(path)
            if txt:
                ref = _extract_ref_from_camt_narrative(txt)
                if ref and _is_valid_camt_ref(ref):
                    return ref

    # 7. Last resort fallback
    return default_fallback

def parse_camt053(content: bytes) -> Dict[str, Any]:
    """
    Parses ISO 20022 Bank-to-Customer Statement (camt.053) across any schema version.
    - Dynamically identifies the best unique transaction reference (EndToEndId, TxId, ClrSysRef, InstrId, etc.)
    - Handles both simple entries (<Ntry>) and batch-booked entries (<NtryDtls>/<TxDtls>)
    - Normalizes amounts strictly to integer-paisa ($1.00 = 100)
    - Captures fees/charges and calculates net amounts
    - Extracts booking/value dates, counterparties, accounts, and remittance narratives
    - Masks credit card numbers (PCI-DSS)
    - Only falls back to CAMT_1, CAMT_2 as a last resort
    """
    # Prohibit DTD and entity declarations to prevent XXE and quadratic blowup (Billion Laughs)
    upper_sample = content[:4096].upper()
    if b"<!DOCTYPE" in upper_sample or b"<!ENTITY" in upper_sample:
        raise ValueError("Security violation: DTD and entity declarations are strictly prohibited in CAMT.053 files.")

    try:
        root = ET.fromstring(content)
    except Exception:
        text_content = content.decode("utf-8", errors="replace")
        root = ET.fromstring(text_content.encode("utf-8"))

    _clean_xml_element_tags(root)

    records = []
    pci_masked_count = 0
    total_amount_paisa = 0
    total_net_paisa = 0

    entries = root.findall(".//Ntry")
    for ntry_idx, ntry in enumerate(entries, start=1):
        ntry_amt_elem = ntry.find("Amt")
        ntry_gross_paisa = _parse_currency_to_paisa(ntry_amt_elem.text) if ntry_amt_elem is not None and ntry_amt_elem.text else 0
        ntry_cdt_dbt = ntry.findtext("CdtDbtInd") or "CRDT"
        ntry_date_raw = _find_first_camt_text(ntry, [".//BookgDt/Dt", ".//BookgDt/DtTm", ".//ValDt/Dt", ".//ValDt/DtTm"])
        ntry_date = _parse_date_to_str(ntry_date_raw) or utc_now().strftime("%Y-%m-%d")

        # Check if entry contains transaction details (<TxDtls>)
        tx_details = ntry.findall(".//TxDtls")
        targets = tx_details if tx_details else [ntry]

        for tx_idx, item in enumerate(targets, start=1):
            record_idx = len(records) + 1
            is_child_tx = (item != ntry)

            # 1. Transaction Amount & Currency
            amt_elem = item.find("Amt")
            if amt_elem is None:
                amt_elem = item.find(".//TxAmt/Amt")
            if amt_elem is None:
                amt_elem = item.find(".//InstdAmt/Amt")
            if amt_elem is None:
                amt_elem = ntry_amt_elem

            gross_paisa = _parse_currency_to_paisa(amt_elem.text) if amt_elem is not None and amt_elem.text else ntry_gross_paisa

            # 2. Charges / Fees & Tax
            fee_elem = item.find(".//Chrgs/Amt")
            if fee_elem is None:
                fee_elem = item.find(".//Chrgs/TtlChrgsAndTaxAmt/Amt")
            if fee_elem is None:
                fee_elem = item.find(".//Chrgs/Rcrd/Amt")
            if fee_elem is None and not is_child_tx:
                fee_elem = ntry.find(".//Chrgs/Amt")
            fee_paisa = _parse_currency_to_paisa(fee_elem.text) if fee_elem is not None and fee_elem.text else 0

            tax_elem = item.find(".//Chrgs/Tax/Amt")
            if tax_elem is None:
                tax_elem = item.find(".//Tax/Amt")
            if tax_elem is None and not is_child_tx:
                tax_elem = ntry.find(".//Tax/Amt")
            tax_paisa = _parse_currency_to_paisa(tax_elem.text) if tax_elem is not None and tax_elem.text else 0

            # 3. Net Paisa
            net_paisa = gross_paisa - fee_paisa - tax_paisa if gross_paisa != 0 else 0

            # 4. Credit / Debit Indicator
            cdt_dbt = item.findtext("CdtDbtInd") or ntry_cdt_dbt

            # 5. Timestamp / Date
            item_date_raw = _find_first_camt_text(item, [".//BookgDt/Dt", ".//BookgDt/DtTm", ".//ValDt/Dt", ".//ValDt/DtTm", ".//AccptncDtTm"])
            date_val = _parse_date_to_str(item_date_raw) or ntry_date

            # 6. Counterparty & Account (IBAN / PAN)
            dbtr_acct = _find_first_camt_text(item, [".//DbtrAcct/Id/IBAN", ".//DbtrAcct/Id/Othr/Id"]) or (
                _find_first_camt_text(ntry, [".//DbtrAcct/Id/IBAN", ".//DbtrAcct/Id/Othr/Id"]) if is_child_tx else None
            )
            cdtr_acct = _find_first_camt_text(item, [".//CdtrAcct/Id/IBAN", ".//CdtrAcct/Id/Othr/Id"]) or (
                _find_first_camt_text(ntry, [".//CdtrAcct/Id/IBAN", ".//CdtrAcct/Id/Othr/Id"]) if is_child_tx else None
            )
            counterparty_acct = dbtr_acct if cdt_dbt == "CRDT" else cdtr_acct
            masked_account = mask_pan_luhn(counterparty_acct) if counterparty_acct else None
            if counterparty_acct and masked_account != counterparty_acct:
                pci_masked_count += 1

            # 7. Narrative / Remittance Information
            narrative_parts = []
            ustrd_nodes = item.findall(".//Ustrd") or (ntry.findall(".//Ustrd") if is_child_tx else [])
            for u in ustrd_nodes:
                if u.text and u.text.strip():
                    narrative_parts.append(u.text.strip())

            addtl_info = _find_first_camt_text(item, [".//AddtlTxInf", ".//AddtlNtryInf"])
            if addtl_info and addtl_info not in narrative_parts:
                narrative_parts.append(addtl_info)
            if is_child_tx:
                addtl_ntry = _find_first_camt_text(ntry, [".//AddtlNtryInf"])
                if addtl_ntry and addtl_ntry not in narrative_parts:
                    narrative_parts.append(addtl_ntry)

            dbtr_nm = _find_first_camt_text(item, [".//Dbtr/Nm"]) or (_find_first_camt_text(ntry, [".//Dbtr/Nm"]) if is_child_tx else None)
            cdtr_nm = _find_first_camt_text(item, [".//Cdtr/Nm"]) or (_find_first_camt_text(ntry, [".//Cdtr/Nm"]) if is_child_tx else None)
            if dbtr_nm and cdt_dbt == "CRDT":
                narrative_parts.append(f"From: {dbtr_nm}")
            elif cdtr_nm and cdt_dbt == "DBIT":
                narrative_parts.append(f"To: {cdtr_nm}")

            narrative_raw = " - ".join(narrative_parts) if narrative_parts else f"camt.053 {cdt_dbt} entry"
            masked_narrative = mask_pan_luhn(narrative_raw)
            if masked_narrative != narrative_raw:
                pci_masked_count += 1

            # 8. Dynamic Reference Identification
            utr = _resolve_camt_reference(item, parent_ntry=ntry, default_fallback=f"CAMT_{record_idx}")

            records.append({
                "record_index": record_idx,
                "utr": utr,
                "amount_paisa": gross_paisa,
                "fee_paisa": fee_paisa,
                "tax_paisa": tax_paisa,
                "net_paisa": net_paisa,
                "timestamp": date_val,
                "masked_account_or_pan": masked_account,
                "narrative": f"[{cdt_dbt}] {masked_narrative}"
            })
            total_amount_paisa += gross_paisa
            total_net_paisa += net_paisa

    return {
        "records": records,
        "summary": {
            "total_records": len(records),
            "total_amount_paisa": total_amount_paisa,
            "net_amount_paisa": total_net_paisa,
            "pci_masked_count": pci_masked_count
        }
    }

# ── SWIFT MT940 Parser ───────────────────────────────────────────────────────

def parse_mt940(content_str: str) -> Dict[str, Any]:
    """Parse SWIFT MT940 Customer Statement message format."""
    lines = content_str.splitlines()
    records = []
    pci_masked_count = 0
    total_amount_paisa = 0
    
    current_rec = None
    r_idx = 0

    for line in lines:
        line_clean = line.strip()
        # :61: Statement Line: YYMMDD[MMDD]C/D[Currency]Amount//Reference
        if line_clean.startswith(":61:"):
            r_idx += 1
            if current_rec:
                records.append(current_rec)
            
            raw_data = line_clean[4:]
            date_part = raw_data[:6]
            formatted_date = f"20{date_part[:2]}-{date_part[2:4]}-{date_part[4:6]}" if len(date_part) == 6 else date_part
            
            # Find Credit (C/CR) or Debit (D/DR)
            cd_match = re.search(r'([CD]R?)[A-Z]?([0-9]+[.,][0-9]*)', raw_data[6:])
            amt_paisa = 0
            if cd_match:
                amt_str = cd_match.group(2).replace(",", ".")
                amt_paisa = _parse_currency_to_paisa(amt_str)
            
            # Extract reference if // is present
            utr_ref = f"MT940_{r_idx}"
            if "//" in raw_data:
                utr_ref = raw_data.split("//")[-1].strip() or utr_ref

            total_amount_paisa += amt_paisa

            current_rec = {
                "record_index": r_idx,
                "utr": utr_ref,
                "amount_paisa": amt_paisa,
                "fee_paisa": 0,
                "tax_paisa": 0,
                "net_paisa": amt_paisa,
                "timestamp": formatted_date,
                "masked_account_or_pan": None,
                "narrative": "SWIFT MT940 Statement Entry"
            }
        elif line_clean.startswith(":86:") and current_rec:
            # :86: Information to Account Owner / Narrative
            raw_narrative = line_clean[4:]
            masked_narrative = mask_pan_luhn(raw_narrative)
            if masked_narrative != raw_narrative:
                pci_masked_count += 1
            current_rec["narrative"] = masked_narrative
            # Try to extract UTR from narrative if not found
            utr_m = re.search(r'(?:UTR|RRN|REF)[:\s]*([A-Za-z0-9]{8,22})', raw_narrative, re.IGNORECASE)
            if utr_m and current_rec["utr"].startswith("MT940_"):
                current_rec["utr"] = utr_m.group(1)

    if current_rec:
        records.append(current_rec)

    return {
        "records": records,
        "summary": {
            "total_records": len(records),
            "total_amount_paisa": total_amount_paisa,
            "net_amount_paisa": total_amount_paisa,
            "pci_masked_count": pci_masked_count
        }
    }

# ── BAI2 Bank Protocol Parser ─────────────────────────────────────────────────

# ── BAI2 Bank Protocol Parser ─────────────────────────────────────────────────

_INVALID_BAI_REFS = {"", "nonref", "0", "000000", "none", "na", "null", "nan", "-", "--", "nil", "unknown", "notprovided"}

def _is_valid_bai_ref(val: Any) -> bool:
    if not val:
        return False
    s = str(val).strip().strip(":,.;#|()[]{}\"'`/")
    return len(s) >= 3 and s.lower() not in _INVALID_BAI_REFS

def _parse_bai2_date(date_str: str) -> Optional[str]:
    if not date_str:
        return None
    d = str(date_str).strip()
    if len(d) == 6 and d.isdigit():
        return f"20{d[:2]}-{d[2:4]}-{d[4:6]}"
    if len(d) == 8 and d.isdigit():
        return f"{d[:4]}-{d[4:6]}-{d[6:8]}"
    return None

def parse_bai2(content_str: str, filename: str = "") -> Dict[str, Any]:
    """
    Parse BAI2 Bank Cash Management format.
    Generically supports standard BAI2 record structures (01, 02, 03, 16, 88, 49, 98, 99),
    multiline continuation records (88), slash/newline delimiters, account-level tracking,
    dynamic reference selection, transaction details in 16 or 03 records, and strict validation.
    """
    if not content_str or not content_str.strip():
        raise ValueError("Malformed BAI2 file: The file is empty or contains only whitespace.")

    # 1. Normalize line breaks and tokenize records
    normalized = content_str.replace("\r\n", "\n").replace("\r", "\n")
    if "\n" not in normalized and "/" in normalized:
        raw_chunks = normalized.split("/")
    else:
        raw_chunks = []
        for line in normalized.split("\n"):
            line = line.strip()
            if not line:
                continue
            if "/" in line:
                parts = [p.strip() for p in line.split("/") if p.strip()]
                raw_chunks.extend(parts)
            else:
                raw_chunks.append(line)

    raw_records: List[List[str]] = []
    for chunk in raw_chunks:
        clean_chunk = chunk.strip().rstrip("/")
        if not clean_chunk:
            continue
        fields = [f.strip() for f in clean_chunk.split(",")]
        if fields:
            raw_records.append(fields)

    # 2. Structural Validation
    record_types = {r[0] for r in raw_records if r}
    has_header = "01" in record_types or "02" in record_types
    has_tx = "16" in record_types or "03" in record_types

    if not has_header and not has_tx:
        raise ValueError(
            "Malformed BAI2 file: The file does not follow standard BAI2 protocol structures (no 01 header or 16/03 records found)."
        )

    # 3. Assemble Multiline Continuations (88 records)
    logical_records: List[List[str]] = []
    current_rec: Optional[List[str]] = None

    for fields in raw_records:
        rec_code = fields[0] if fields else ""
        if rec_code == "88" and current_rec is not None:
            cont_fields = fields[1:]
            if cont_fields:
                if len(current_rec) < 7:
                    needed = 7 - len(current_rec)
                    current_rec.extend(cont_fields[:needed])
                    remaining = cont_fields[needed:]
                else:
                    remaining = cont_fields
                if remaining:
                    if len(current_rec) <= 6:
                        current_rec.append(" ".join(remaining))
                    else:
                        current_rec[6] += " " + " ".join(remaining)
        else:
            if current_rec is not None:
                logical_records.append(current_rec)
            current_rec = fields

    if current_rec is not None:
        logical_records.append(current_rec)

    # 4. Parse Logical Records
    records_16: List[Dict[str, Any]] = []
    records_03: List[Dict[str, Any]] = []
    pci_masked_count = 0
    current_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    current_account = None

    for r in logical_records:
        code = r[0]
        # 01 File Header: scan fields for valid date
        if code == "01":
            for f in r[1:]:
                parsed_d = _parse_bai2_date(f)
                if parsed_d:
                    current_date = parsed_d
                    break
        # 02 Group Header: scan fields for group as-of-date
        elif code == "02":
            for f in r[1:]:
                parsed_d = _parse_bai2_date(f)
                if parsed_d:
                    current_date = parsed_d
                    break
        # 03 Account Identifier & Status / Transactions
        elif code == "03":
            raw_acc = r[1].strip() if len(r) > 1 else ""
            masked_acc = mask_pan_luhn(raw_acc) if raw_acc else None
            if masked_acc and masked_acc != raw_acc:
                pci_masked_count += 1
            current_account = masked_acc

            # Check if this 03 record has an amount / transaction payload
            clean_parts = [p.strip() for p in r if p.strip() != ""]
            if len(clean_parts) >= 4:
                if len(clean_parts[2]) == 3 and clean_parts[2].isalpha() and clean_parts[2].isupper():
                    type_code = clean_parts[3] if len(clean_parts) > 3 else ""
                    amt_str = clean_parts[4] if len(clean_parts) > 4 else "0"
                    rem = clean_parts[5:] if len(clean_parts) > 5 else []
                else:
                    type_code = clean_parts[2]
                    amt_str = clean_parts[3] if len(clean_parts) > 3 else "0"
                    rem = clean_parts[4:] if len(clean_parts) > 4 else []

                amt_paisa = _parse_currency_to_paisa(amt_str)
                if amt_paisa > 0:
                    if rem and rem[0].isdigit() and len(rem[0]) <= 4:
                        ref_and_text = rem[1:]
                    else:
                        ref_and_text = rem

                    ref = ref_and_text[0] if len(ref_and_text) >= 1 else ""
                    text_desc = " ".join(ref_and_text[1:]) if len(ref_and_text) >= 2 else ""

                    if not _is_valid_bai_ref(ref):
                        if text_desc:
                            m_ctx = re.search(r"(?i)\b(?:UTR|RRN|REF|TXN)[_#\s:-]+([A-Za-z0-9_-]{6,34})\b", text_desc)
                            ref = m_ctx.group(1) if m_ctx and _is_valid_bai_ref(m_ctx.group(1)) else f"BAI2_03_{len(records_03) + 1}"
                        else:
                            ref = f"BAI2_03_{len(records_03) + 1}"

                    masked_desc = mask_pan_luhn(text_desc) if text_desc else f"BAI2 account transaction {ref}"
                    if masked_desc != text_desc:
                        pci_masked_count += 1

                    direction = "DBIT" if (type_code.isdigit() and 400 <= int(type_code) <= 699) else "CRDT"

                    records_03.append({
                        "record_index": len(records_03) + 1,
                        "utr": ref,
                        "amount_paisa": amt_paisa,
                        "fee_paisa": 0,
                        "tax_paisa": 0,
                        "net_paisa": amt_paisa,
                        "timestamp": current_date,
                        "masked_account_or_pan": current_account,
                        "narrative": f"[{direction}] {masked_desc}"
                    })

        # 16 Transaction Detail
        elif code == "16" and len(r) >= 3:
            r_idx = len(records_16) + 1
            type_code = r[1].strip()
            amount_str = r[2].strip()
            amount_paisa = _parse_currency_to_paisa(amount_str)

            direction = "CRDT"
            if type_code.isdigit() and 400 <= int(type_code) <= 699:
                direction = "DBIT"

            bank_ref = r[4].strip() if len(r) > 4 else ""
            cust_ref = r[5].strip() if len(r) > 5 else ""
            text_raw = r[6].strip() if len(r) > 6 else ""

            utr = None
            if _is_valid_bai_ref(bank_ref):
                utr = bank_ref.strip().strip(":,.;#|()[]{}\"'`/")
            elif _is_valid_bai_ref(cust_ref):
                utr = cust_ref.strip().strip(":,.;#|()[]{}\"'`/")
            elif text_raw:
                m_ctx = re.search(r"(?i)\b(?:UTR|RRN|REF|TXN)[_#\s:-]+([A-Za-z0-9_-]{6,34})\b", text_raw)
                if m_ctx and _is_valid_bai_ref(m_ctx.group(1)):
                    utr = m_ctx.group(1)

            if not utr:
                utr = f"BAI2_{r_idx}"

            masked_text = mask_pan_luhn(text_raw) if text_raw else f"BAI2 {direction} entry"
            if masked_text != text_raw:
                pci_masked_count += 1

            records_16.append({
                "record_index": r_idx,
                "utr": utr,
                "amount_paisa": amount_paisa,
                "fee_paisa": 0,
                "tax_paisa": 0,
                "net_paisa": amount_paisa,
                "timestamp": current_date,
                "masked_account_or_pan": current_account,
                "narrative": f"[{direction}] {masked_text}"
            })

    # Select final records: 16 detail records take precedence when present; otherwise 03 records
    final_records = records_16 if records_16 else records_03

    for idx, rec in enumerate(final_records, 1):
        rec["record_index"] = idx

    total_amount_paisa = sum(r["amount_paisa"] for r in final_records)

    return {
        "records": final_records,
        "summary": {
            "total_records": len(final_records),
            "total_amount_paisa": total_amount_paisa,
            "net_amount_paisa": total_amount_paisa,
            "pci_masked_count": pci_masked_count
        }
    }

# ── Generic Dynamic XLSX Spreadsheet Parser ───────────────────────────────────

def parse_xlsx(content: bytes, filename: str) -> Dict[str, Any]:
    """
    Dynamically parses any valid XLSX spreadsheet for dispute and reconciliation evidence.
    - Inspects all sheets to select transaction table(s)
    - Dynamically discovers header rows bypassing leading banners, metadata, and logos
    - Tolerates arbitrary column ordering, custom nomenclature, and missing columns
    - Employs heuristic data-type profiling if headers are absent or non-standard
    - Strictly normalizes currency values to integer paisa/cents ($1.00 = 100)
    - Masks credit card numbers (PCI-DSS) across accounts and narratives
    """
    import openpyxl

    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    except Exception as e:
        # Fallback to empty records if corrupt
        return {
            "records": [],
            "summary": {"total_records": 0, "total_amount_paisa": 0, "net_amount_paisa": 0, "pci_masked_count": 0}
        }

    footer_keywords = {
        "total", "grand total", "subtotal", "sub-total", "count", "sum",
        "average", "avg", "summary", "report total", "net total"
    }

    sheet_evaluations = []

    for sheet_name in wb.sheetnames:
        sheet = wb[sheet_name]
        all_rows = []
        for r in sheet.iter_rows(values_only=True):
            all_rows.append(list(r))
        if not all_rows:
            continue

        best_header_idx = 0
        best_score = -1
        best_col_map: Dict[str, int] = {}

        # Scan top 35 rows for the most probable header row
        limit = min(35, len(all_rows))
        for r_idx in range(limit):
            row = all_rows[r_idx]
            if not row or all(c is None or str(c).strip() == "" for c in row):
                continue

            cleaned = [_clean_header(c) if c is not None else "" for c in row]

            col_map: Dict[str, int] = {}
            for c_idx, h in enumerate(cleaned):
                if not h:
                    continue
                if (h in _DATE_KEYS or any(k in h for k in ("date", "time", "valdate", "timestamp", "settledat", "createdat"))) and "date" not in col_map:
                    col_map["date"] = c_idx
                elif (h in _FEE_KEYS or any(k in h for k in ("fee", "mdr", "commiss", "charge", "deduction"))) and "fee" not in col_map:
                    col_map["fee"] = c_idx
                elif (h in _TAX_KEYS or any(k in h for k in ("tax", "gst", "tds", "vat", "cess"))) and "tax" not in col_map:
                    col_map["tax"] = c_idx
                elif (h in _NET_KEYS or any(k in h for k in ("netamount", "payoutamount", "settledamount", "netcredit", "netpayable", "netpaid", "amountcredited")) or h in ("net", "payout", "settled")) and "net" not in col_map:
                    col_map["net"] = c_idx
                elif (h in _AMOUNT_KEYS or any(k in h for k in ("amount", "gross", "txnamt", "credit", "deposit", "total", "paid", "billing"))) and "amount" not in col_map:
                    col_map["amount"] = c_idx
                elif (h in _UTR_KEYS or any(k in h for k in ("utr", "rrn", "bankref", "refno", "reference", "txnid", "orderid", "paymentid", "transid", "docno"))) and "utr" not in col_map:
                    col_map["utr"] = c_idx
                elif (h in _ACCOUNT_KEYS or any(k in h for k in ("card", "account", "acc", "pan", "vpa", "upi"))) and "account" not in col_map:
                    col_map["account"] = c_idx
                elif (h in _NARRATIVE_KEYS or any(k in h for k in ("narrative", "desc", "remark", "particular", "note", "detail", "reason", "status"))) and "narrative" not in col_map:
                    col_map["narrative"] = c_idx
                elif (h in _CURRENCY_KEYS or any(k in h for k in ("currency", "curr", "ccy"))) and "currency" not in col_map:
                    col_map["currency"] = c_idx

            score = 0
            if "amount" in col_map or "net" in col_map:
                score += 5
            if "utr" in col_map:
                score += 4
            if "date" in col_map:
                score += 3
            if "fee" in col_map or "tax" in col_map:
                score += 2
            if "account" in col_map or "narrative" in col_map:
                score += 1

            string_cells = sum(1 for c in row if isinstance(c, str) and c.strip())
            score += min(string_cells, 5)

            if r_idx + 1 < len(all_rows) and any(all_rows[r_idx + 1]):
                score += 2

            if score > best_score:
                best_score = score
                best_header_idx = r_idx
                best_col_map = col_map

        data_rows_count = max(0, len(all_rows) - (best_header_idx + 1))
        sheet_score = best_score * 10 + min(data_rows_count, 50)

        # Priority boost for sheets with transaction-oriented names
        name_lower = sheet_name.lower()
        if any(w in name_lower for w in ("settle", "trans", "txn", "data", "report", "detail", "entry", "statement", "sheet1")):
            sheet_score += 20
        elif any(w in name_lower for w in ("cover", "summary", "readme", "instruction", "meta", "faq")):
            sheet_score -= 30

        sheet_evaluations.append({
            "name": sheet_name,
            "score": sheet_score,
            "header_idx": best_header_idx,
            "col_map": best_col_map,
            "rows": all_rows
        })

    if not sheet_evaluations:
        return {
            "records": [],
            "summary": {"total_records": 0, "total_amount_paisa": 0, "net_amount_paisa": 0, "pci_masked_count": 0}
        }

    # Sort sheets by quality
    sheet_evaluations.sort(key=lambda s: s["score"], reverse=True)
    
    # Determine which sheets to process:
    # If the top sheet is strong (score >= 25), check if other sheets also have valid tables
    top_score = sheet_evaluations[0]["score"]
    sheets_to_process = [sheet_evaluations[0]]
    for other in sheet_evaluations[1:]:
        if other["score"] >= 25 and other["score"] >= top_score * 0.7 and len(other["rows"]) > 1:
            sheets_to_process.append(other)

    records = []
    pci_masked_count = 0
    total_amount_paisa = 0
    total_net_paisa = 0

    for sheet_info in sheets_to_process:
        rows = sheet_info["rows"]
        header_idx = sheet_info["header_idx"]
        col_map = dict(sheet_info["col_map"])
        sheet_name = sheet_info["name"]

        # Heuristic profiling fallback if columns are still unmapped
        data_sample = rows[header_idx + 1 : header_idx + 21]
        if data_sample:
            # 1. Amount profiling
            if "amount" not in col_map and "net" not in col_map:
                num_counts = {}
                for r in data_sample:
                    for c_idx, cell in enumerate(r):
                        if cell is not None and (_parse_currency_to_paisa(cell) > 0 or isinstance(cell, (int, float))):
                            num_counts[c_idx] = num_counts.get(c_idx, 0) + 1
                if num_counts:
                    col_map["amount"] = max(num_counts, key=num_counts.get)

            # 2. UTR profiling
            if "utr" not in col_map:
                str_counts = {}
                for r in data_sample:
                    for c_idx, cell in enumerate(r):
                        if c_idx not in col_map.values() and cell is not None:
                            s_val = str(cell).strip()
                            if 6 <= len(s_val) <= 34 and re.match(r'^[A-Za-z0-9_-]+$', s_val):
                                str_counts[c_idx] = str_counts.get(c_idx, 0) + 1
                if str_counts:
                    col_map["utr"] = max(str_counts, key=str_counts.get)

            # 3. Date profiling
            if "date" not in col_map:
                date_counts = {}
                for r in data_sample:
                    for c_idx, cell in enumerate(r):
                        if c_idx not in col_map.values() and cell is not None:
                            if _parse_date_to_str(cell) is not None:
                                date_counts[c_idx] = date_counts.get(c_idx, 0) + 1
                if date_counts:
                    col_map["date"] = max(date_counts, key=date_counts.get)

        for r_idx, row in enumerate(rows[header_idx + 1:], start=header_idx + 2):
            if not row or all(c is None or str(c).strip() == "" for c in row):
                continue

            first_non_empty = next((str(c).strip().lower() for c in row if c is not None and str(c).strip() != ""), "")
            if any(first_non_empty.startswith(k) for k in footer_keywords):
                continue

            def get_val(k: str) -> Any:
                if k in col_map and col_map[k] < len(row):
                    return row[col_map[k]]
                return None

            raw_account = str(get_val("account")).strip() if get_val("account") is not None else None
            masked_account = mask_pan_luhn(raw_account) if raw_account else None
            if raw_account and masked_account != raw_account:
                pci_masked_count += 1

            raw_narrative = str(get_val("narrative")).strip() if get_val("narrative") is not None else None
            if raw_narrative and raw_narrative.lower() not in ("none", "nan", "null"):
                masked_narrative = mask_pan_luhn(raw_narrative)
                if masked_narrative != raw_narrative:
                    pci_masked_count += 1
            else:
                masked_narrative = f"Spreadsheet record #{len(records) + 1}"

            gross_paisa = _parse_currency_to_paisa(get_val("amount"))
            fee_paisa = _parse_currency_to_paisa(get_val("fee"))
            tax_paisa = _parse_currency_to_paisa(get_val("tax"))
            raw_net = get_val("net")

            if raw_net is not None and str(raw_net).strip() != "":
                net_paisa = _parse_currency_to_paisa(raw_net)
            elif gross_paisa != 0:
                net_paisa = gross_paisa - fee_paisa - tax_paisa
            else:
                net_paisa = 0

            # If gross was 0 but net was present
            if gross_paisa == 0 and net_paisa != 0:
                gross_paisa = net_paisa + fee_paisa + tax_paisa

            # If both are still 0, check other columns for any monetary numbers
            if gross_paisa == 0 and net_paisa == 0:
                for c_idx, cell in enumerate(row):
                    if c_idx not in (col_map.get("utr"), col_map.get("date"), col_map.get("account")):
                        p = _parse_currency_to_paisa(cell)
                        if p != 0:
                            gross_paisa = p
                            net_paisa = p
                            break

            # UTR / Reference extraction
            raw_utr = get_val("utr")
            utr = str(raw_utr).strip() if raw_utr is not None else ""
            if not utr or utr.lower() in ("none", "nan", "null", "-", ""):
                # Check other cells for a reference pattern
                for cell in row:
                    if cell is not None:
                        s_c = str(cell).strip()
                        m = re.search(r'\b((?:UTR|RRN|REF|TXN|ID)[_#\s-]*[A-Za-z0-9_-]{6,30})\b', s_c, re.IGNORECASE)
                        if m:
                            utr = m.group(1).replace(' ', '')
                            break
                        tokens = re.findall(r'\b[A-Za-z0-9_-]{8,32}\b', s_c)
                        for tok in tokens:
                            if any(c.isdigit() for c in tok) and not re.match(r'^\d{4}-\d{2}-\d{2}', tok):
                                utr = tok
                                break
                        if utr:
                            break
            if not utr or utr.lower() in ("none", "nan", "null", "-"):
                utr = f"XLSX_ROW_{len(records) + 1}"

            date_str = _parse_date_to_str(get_val("date")) or utc_now().strftime("%Y-%m-%d")

            records.append({
                "record_index": len(records) + 1,
                "utr": utr,
                "amount_paisa": gross_paisa,
                "fee_paisa": fee_paisa,
                "tax_paisa": tax_paisa,
                "net_paisa": net_paisa,
                "timestamp": date_str,
                "masked_account_or_pan": masked_account,
                "narrative": masked_narrative
            })
            total_amount_paisa += gross_paisa
            total_net_paisa += net_paisa

    return {
        "records": records,
        "summary": {
            "total_records": len(records),
            "total_amount_paisa": total_amount_paisa,
            "net_amount_paisa": total_net_paisa,
            "pci_masked_count": pci_masked_count
        }
    }

# ── Unstructured Document / Advice Slip Regex Parser ──────────────────────────

_DOC_REF_PATTERNS: List[Tuple[int, str]] = [
    # Tier 1: UTR, Clearing, RRN (Universal Clearing Trace)
    (100, r"\b(?:Unique\s*Transaction\s*Ref(?:erence)?|UTR(?:\s*No|\s*Number|\s*Ref|\s*ID)?|RRN(?:\s*No|\s*Number)?|Clearing\s*(?:Ref(?:erence)?|Trace\s*No))\b"),
    # Tier 2: End-to-End ID (Universal ISO/Payment Reference)
    (95,  r"\b(?:End[- ]?to[- ]?End\s*(?:ID|Id|Ref(?:erence)?|No|Number)|E2E\s*(?:ID|Id|Ref(?:erence)?|No)|EndToEndId)\b"),
    # Tier 3: Transaction ID / Number / Reference
    (90,  r"\b(?:Transaction\s*(?:ID|Id|No|Number|Ref(?:erence)?|Code)|Txn\s*(?:ID|Id|No|Number|Ref(?:erence)?)|Trans\s*(?:ID|Id|No|Ref)|TXNID)\b"),
    # Tier 4: Payment Reference / ID / Number
    (85,  r"\b(?:Payment\s*(?:Ref(?:erence)?(?:\s*No|\s*Number)?|ID|Id|No|Number|Code)|Pmt\s*(?:Ref|ID|Id|No))\b"),
    # Tier 5: Advice Reference / Number
    (80,  r"\b(?:Advice\s*(?:Ref(?:erence)?(?:\s*No|\s*Number)?|No|Number|ID|Id)|Payment\s*Advice\s*(?:Ref(?:erence)?|No|Number)|Advice\s*Slip\s*(?:Ref|No))\b"),
    # Tier 6: Bank Reference / Host Reference
    (75,  r"\b(?:Bank\s*(?:Ref(?:erence)?(?:\s*No|\s*Number)?|Txn\s*ID|Transaction\s*Ref|Ack\s*No)|Host\s*Ref(?:erence)?)\b"),
    # Tier 7: Remittance Reference / Information
    (70,  r"\b(?:Remittance\s*(?:Ref(?:erence)?(?:\s*No|\s*Number)?|ID|Id|No|Number|Info(?:rmation)?))\b"),
    # Tier 8: Instruction / Order / Mandate Reference
    (65,  r"\b(?:Instruction\s*(?:ID|Id|Ref(?:erence)?|No)|Order\s*(?:ID|Id|Ref(?:erence)?|No|Number)|Mandate\s*(?:ID|Id|Ref))\b"),
    # Tier 9: Customer / Client / Sender / Beneficiary Reference
    (60,  r"\b(?:Customer\s*Ref(?:erence)?|Client\s*Ref(?:erence)?|Beneficiary\s*Ref(?:erence)?|Sender\s*Ref(?:erence)?|Cust\s*Ref)\b"),
    # Tier 10: Document / Voucher / Slip / Challan Number
    (55,  r"\b(?:Document\s*(?:Ref(?:erence)?|No|Number)|Doc\s*(?:Ref|No|Number)|Voucher\s*(?:No|Number)|Challan\s*(?:No|Number)|Slip\s*(?:No|Number))\b"),
    # Tier 11: General Reference No / ID
    (50,  r"\b(?:Ref(?:erence)?(?:\s*No|\s*Number|\s*ID|\s*Id|\s*Code)?)\b"),
    # Tier 12: Authorization / Approval / Trace Code
    (45,  r"\b(?:Auth(?:orization)?\s*Code|Approval\s*Code|Trace\s*(?:ID|Id|No|Number))\b"),
]

_DOC_INVALID_REF_VALUES = {
    "amount", "total", "date", "inr", "rs", "usd", "eur", "gbp", "status", "success", "successful",
    "pending", "failed", "completed", "approved", "rejected", "credit", "debit", "paisa", "cents",
    "bank", "payment", "advice", "slip", "reference", "transaction", "details", "description",
    "particulars", "remarks", "customer", "beneficiary", "account", "balance", "yes", "no", "true",
    "false", "na", "n/a", "none", "null", "nan", "nil", "unknown", "notprovided", "undefined",
    "doc_ref_extracted", "summary", "statement", "processed", "settlement"
}

def _is_valid_doc_ref(tok: Optional[str]) -> bool:
    if not tok:
        return False
    s = str(tok).strip().strip(":,.;#|()[]{}\"'`")
    if len(s) < 5 or len(s) > 42:
        return False
    if s.lower() in _DOC_INVALID_REF_VALUES:
        return False
    # Reject date-like strings
    if re.match(r"^\d{4}[-/]\d{2}[-/]\d{2}", s) or re.match(r"^\d{2}[-/]\d{2}[-/]\d{4}", s) or re.match(r"^\d{2}-[A-Za-z]{3}-\d{2,4}", s):
        return False
    # Reject pure currency numbers
    if re.match(r"^[₹$€£]?\s*[\d,]+(?:\.\d+)?$", s):
        return False
    # Must have alphanumeric characters
    if not any(c.isalnum() for c in s):
        return False
    # Avoid single repeating characters like ----- or 00000
    if len(set(s)) <= 2:
        return False
    return True

def _clean_doc_ref_token(raw: str) -> str:
    cleaned = raw.strip().strip(":,.;#|()[]{}\"'`")
    m = re.match(r"^([A-Za-z0-9][A-Za-z0-9_./#-]{3,38}[A-Za-z0-9])", cleaned)
    return m.group(1) if m else cleaned

def extract_best_document_reference(content_str: str) -> str:
    """
    Dynamically identifies the best available unique transaction or payment reference
    from any supported advice slip or financial document text across different banks,
    issuers, layouts, and label variations.
    Only returns DOC_REF_EXTRACTED when no genuine reference exists.
    """
    candidates: List[Tuple[int, str]] = []
    lines = content_str.splitlines()

    for score, pat in _DOC_REF_PATTERNS:
        # 1. Match same-line patterns: Label [separator] Value
        full_regex = re.compile(rf"{pat}\s*(?:\([A-Za-z0-9_-]+\))?[:\s#\t\-\|=]+([A-Za-z0-9][A-Za-z0-9_./#-]{{3,38}}[A-Za-z0-9])", re.IGNORECASE)
        for m in full_regex.finditer(content_str):
            tok = _clean_doc_ref_token(m.group(1))
            if _is_valid_doc_ref(tok):
                digit_bonus = 5 if any(c.isdigit() for c in tok) else 0
                candidates.append((score + digit_bonus, tok))

        # 2. Match two-line layouts: Label on line i, Value on line i+1
        for i, line in enumerate(lines):
            line_str = line.strip()
            if re.search(rf"^{pat}\s*(?:\([A-Za-z0-9_-]+\))?[:\s#\t\-\|=]*$", line_str, re.IGNORECASE) and i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                tokens = next_line.split()
                if tokens:
                    cand = _clean_doc_ref_token(tokens[0])
                    if _is_valid_doc_ref(cand):
                        digit_bonus = 5 if any(c.isdigit() for c in cand) else 0
                        candidates.append((score + digit_bonus, cand))

    # 3. Contextual regex for standalone UTR/RRN/TXN tokens
    m_ctx = re.search(r"\b(?:UTR|RRN|REF|TXN)[_#\s:-]+([A-Za-z0-9_-]{8,32})\b", content_str, re.IGNORECASE)
    if m_ctx:
        tok = _clean_doc_ref_token(m_ctx.group(1))
        if _is_valid_doc_ref(tok):
            candidates.append((35, tok))

    if candidates:
        candidates.sort(key=lambda x: x[0], reverse=True)
        return candidates[0][1]

    return "DOC_REF_EXTRACTED"

def extract_text_from_pdf(content: bytes) -> str:
    """Extracts text streams from PDF bytes using pypdf, falling back to raw text decode."""
    try:
        import io
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(content))
        extracted_pages = []
        for page in reader.pages:
            t = page.extract_text()
            if t:
                extracted_pages.append(t)
        if extracted_pages:
            return "\n".join(extracted_pages)
    except Exception:
        pass
    return content.decode("utf-8", errors="replace")

def parse_document_text(content_str: str) -> Dict[str, Any]:
    """
    Extracts structured transaction key-values from OCR text, debit advice slips,
    payment confirmations, or bank letters.
    Dynamically resolves the best available reference, amounts, fees, net, and date.
    """
    records = []
    pci_masked_count = 0

    # 1. Best Available Reference
    utr = extract_best_document_reference(content_str)

    # 2. Monetary Amounts (Gross, Net, Fee, Tax)
    # Gross / Total Amount
    gross_m = re.search(
        r"(?i)\b(?:Gross\s*Amount|Total\s*Amount|Transaction\s*Amount|Amount\s*Paid|Total\s*Paid|Amount|Total|Credited|Deposited)[:\s#\t\-\|=]*(?:[₹$€£]|INR|Rs\.?|USD|EUR|GBP)?\s*([0-9,]+(?:\.[0-9]{1,2})?)",
        content_str
    )
    gross_paisa = _parse_currency_to_paisa(gross_m.group(1)) if gross_m else 0

    # Fee / Charges
    fee_m = re.search(
        r"(?i)\b(?:Fee|Processing\s*Fee|Charges|MDR|Commission)\s*(?:\([^)]+\))?[:\s#\t\-\|=]*(?:[₹$€£]|INR|Rs\.?|USD|EUR|GBP)?\s*([0-9,]+(?:\.[0-9]{1,2})?)",
        content_str
    )
    fee_paisa = _parse_currency_to_paisa(fee_m.group(1)) if fee_m else 0

    # Tax / GST
    tax_m = re.search(
        r"(?i)\b(?:Tax|GST|IGST|CGST|SGST|VAT|TDS)\s*(?:\([^)]+\))?[:\s#\t\-\|=]*(?:[₹$€£]|INR|Rs\.?|USD|EUR|GBP)?\s*([0-9,]+(?:\.[0-9]{1,2})?)",
        content_str
    )
    tax_paisa = _parse_currency_to_paisa(tax_m.group(1)) if tax_m else 0

    # Net Amount
    net_m = re.search(
        r"(?i)\b(?:Net\s*(?:Payout\s*|Credited\s*)?Amount|Net\s*Paid|Net\s*Credited|Net\s*Payout|Net)[:\s#\t\-\|=]*(?:[₹$€£]|INR|Rs\.?|USD|EUR|GBP)?\s*([0-9,]+(?:\.[0-9]{1,2})?)",
        content_str
    )
    if net_m:
        net_paisa = _parse_currency_to_paisa(net_m.group(1))
    elif gross_paisa != 0:
        net_paisa = gross_paisa - fee_paisa - tax_paisa
    else:
        net_paisa = 0

    if gross_paisa == 0 and net_paisa != 0:
        gross_paisa = net_paisa + fee_paisa + tax_paisa

    # 3. Date
    date_m = re.search(
        r"(?i)\b(?:Date(?:\s*of\s*Transfer)?|Dated|Value\s*Date|Txn\s*Date|Payment\s*Date|Settled\s*Date|Booking\s*Date)[:\s#\t\-\|=]*([0-9]{1,4}[-/][0-9]{1,2}[-/][0-9]{2,4}|[0-9]{1,2}-[A-Za-z]{3}-[0-9]{2,4}|[A-Za-z]{3,9}\s+[0-9]{1,2},\s*[0-9]{4})",
        content_str
    )
    date_str = _parse_date_to_str(date_m.group(1)) if date_m else datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # 4. Account / Card
    acct_m = re.search(
        r"(?i)\b(?:Account\s*(?:No|Number)?|A/c(?:\s*No)?|Card\s*(?:No|Number)?|IBAN|VPA|UPI\s*ID)[:\s#\t\-\|=]*([A-Za-z0-9@._-]{6,34})",
        content_str
    )
    masked_account = None
    if acct_m:
        raw_acct = acct_m.group(1).strip()
        masked_account = mask_pan_luhn(raw_acct)
        if masked_account != raw_acct:
            pci_masked_count += 1

    # 5. Narrative & PCI Masking across entire document
    masked_doc = mask_pan_luhn(content_str)
    if masked_doc != content_str:
        pci_masked_count += 1

    rem_m = re.search(r"(?i)\b(?:Remarks?|Description|Particulars?|Payment\s*For|Narration)[:\s#\t\-\|=]*([^\r\n]{5,100})", content_str)
    narrative_text = rem_m.group(1).strip() if rem_m else f"Payment Advice Slip - {utr}"
    masked_narrative = mask_pan_luhn(narrative_text)

    records.append({
        "record_index": 1,
        "utr": utr,
        "amount_paisa": gross_paisa,
        "fee_paisa": fee_paisa,
        "tax_paisa": tax_paisa,
        "net_paisa": net_paisa,
        "timestamp": date_str,
        "masked_account_or_pan": masked_account,
        "narrative": masked_narrative
    })

    return {
        "records": records,
        "summary": {
            "total_records": len(records),
            "total_amount_paisa": gross_paisa,
            "net_amount_paisa": net_paisa,
            "pci_masked_count": pci_masked_count
        }
    }

# ── Universal Parser Router ───────────────────────────────────────────────────

def route_and_parse(content: bytes, filename: str) -> Dict[str, Any]:
    """
    Inspects file extension and byte signature to route to the optimal parser.
    Returns sanitized, normalized data with integer-paisa amounts.
    """
    fn_lower = filename.lower()
    
    # 1. Delimited CSV / TSV
    if fn_lower.endswith((".csv", ".tsv")):
        parsed = parse_delimited(content, filename)
        file_type = "TSV" if fn_lower.endswith(".tsv") else "CSV"
        return {"file_type": file_type, **parsed}

    # 2. XLSX Spreadsheet Parser
    if fn_lower.endswith((".xlsx", ".xlsm", ".xls")) or (
        content.startswith(b"PK\x03\x04") and any(sub in content[:2000] for sub in (b"workbook", b"[Content_Types].xml", b"xl/"))
    ):
        try:
            parsed = parse_xlsx(content, filename)
            return {"file_type": "XLSX", **parsed}
        except Exception:
            pass

    # Decode text for string parsers
    text_content = content.decode("utf-8", errors="replace")

    # 3. ISO 20022 XML (camt.053)
    if fn_lower.endswith(".xml") or any(sub in text_content for sub in ("BkToCstmrStmt", "camt.053", "camt:Document", "iso:20022")):
        try:
            parsed = parse_camt053(content)
            return {"file_type": "CAMT053", **parsed}
        except Exception:
            pass

    # 4. SWIFT MT940
    if fn_lower.endswith((".txt", ".dat", ".sta")) and (":20:" in text_content and ":61:" in text_content):
        parsed = parse_mt940(text_content)
        return {"file_type": "MT940", **parsed}

    # 5. BAI2 Bank Cash Management format
    is_bai_name = fn_lower.endswith((".bai", ".bai2"))
    is_bai_content = (
        ("01," in text_content or text_content.startswith("01,") or bool(re.search(r"^\s*01\s*[,/]", text_content, re.MULTILINE)))
        and any(sub in text_content for sub in ("16,", "02,", "03,", "49,", "98,", "99,", "/"))
    )
    if is_bai_name or is_bai_content:
        parsed = parse_bai2(text_content, filename=filename)
        return {"file_type": "BAI2", **parsed}

    # 6. Default Document / Advice slip text parsing
    is_pdf = fn_lower.endswith(".pdf") or content.startswith(b"%PDF-")
    if is_pdf:
        doc_text = extract_text_from_pdf(content)
        file_type = "PDF"
    else:
        doc_text = text_content
        file_type = "IMAGE" if fn_lower.endswith((".png", ".jpg", ".jpeg")) else "DOCUMENT"

    parsed = parse_document_text(doc_text)
    return {"file_type": file_type, **parsed}
