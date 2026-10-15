"""Straight-through processing for the five most common service requests.

A request that passes every rule is fulfilled at once, with no officer: the ledger/state change is atomic and
audited, the request is COMPLETED, and the customer is notified. Anything outside the rules goes to the officer
queue exactly as before, with the reason recorded (STP_REFERRED).

  cheque_book           P1-04  issue a cheque book (max one per account per 30 days)
  stop_cheque           P1-05  record a stop-payment instruction (protective, always allowed)
  deposit               P1-19 / P1-20  book a fixed or recurring deposit from the customer's own account
  standing_instruction  P2-10  register a recurring payment to an active, non-flagged payee
  certificate           P1-21 / P1-22  compute an interest or TDS certificate from the ledger
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

STP_SKILLS = {"cheque_book", "stop_cheque", "deposit", "standing_instruction", "certificate", "statement", "appointment", "nominee_update"}
FD_AUTO_LIMIT_MINOR = 10_00_000 * 100      # ₹10 lakh; larger deposits get an officer check
RD_AUTO_LIMIT_MINOR = 1_00_000 * 100       # ₹1 lakh monthly instalment
SI_AUTO_LIMIT_MINOR = 1_00_000 * 100       # ₹1 lakh per instruction
CHEQUE_BOOK_COOLDOWN_DAYS = 30
FD_RATES = {6: 7.25, 12: 7.50, 24: 7.75, 36: 8.10, 60: 8.10}  # % p.a. by tenure (illustrative demo card rates)
RD_RATES = {6: 6.75, 12: 7.00, 24: 7.25, 36: 7.50, 60: 7.50}

Referral = Tuple[None, str]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def _kyc_ok(customer: Dict[str, Any]) -> bool:
    return (customer.get("kyc") or {}).get("status", "VERIFIED") == "VERIFIED"


def _own_account(state: Dict[str, Any], customer_id: str, account_id: str) -> Optional[Dict[str, Any]]:
    account = state.get("accounts", {}).get(account_id)
    return account if account and account.get("customer_id") == customer_id and account.get("status") == "ACTIVE" else None


def _cheque_book(state, customer_id, customer, f, request_id):
    account = _own_account(state, customer_id, f["account_id"])
    if not account:
        return None, "Account is not active or not owned by the customer"
    recent = [b for b in state.get("cheque_books", {}).values() if b["account_id"] == account["id"]
              and _now() - datetime.fromisoformat(b["issued_at"].replace("Z", "+00:00")) < timedelta(days=CHEQUE_BOOK_COOLDOWN_DAYS)]
    if recent:
        return None, f"A cheque book was already issued for this account in the last {CHEQUE_BOOK_COOLDOWN_DAYS} days"
    books = state.setdefault("cheque_books", {})
    first = 100001 + 50 * len(books)
    leaves = int(f["leaves"])
    book = {"id": f"CHQ-{request_id[-8:]}", "customer_id": customer_id, "account_id": account["id"], "leaves": leaves,
            "first_cheque": f"{first:06d}", "last_cheque": f"{first + leaves - 1:06d}", "delivery": f["delivery"],
            "status": "DISPATCH_QUEUED" if f["delivery"] == "REGISTERED_ADDRESS" else "READY_AT_BRANCH", "issued_at": _iso(_now())}
    books[book["id"]] = book
    return {"summary": f"Cheque book {book['first_cheque']}–{book['last_cheque']} ({leaves} leaves) issued", "cheque_book": book}, None


def _stop_cheque(state, customer_id, customer, f, request_id):
    account = _own_account(state, customer_id, f["account_id"])
    if not account:
        return None, "Account is not active or not owned by the customer"
    number = f["cheque_number"]
    issued = [b for b in state.get("cheque_books", {}).values() if b["account_id"] == account["id"]]
    if issued and not any(b["first_cheque"] <= number <= b["last_cheque"] for b in issued):
        return None, "Cheque number is not from a cheque book issued on this account"
    stops = state.setdefault("stop_cheques", {})
    if any(s["account_id"] == account["id"] and s["cheque_number"] == number for s in stops.values()):
        return None, "A stop instruction already exists for this cheque"
    stop = {"id": f"STP-{request_id[-8:]}", "customer_id": customer_id, "account_id": account["id"], "cheque_number": number,
            "reason": f["reason"], "status": "ACTIVE", "created_at": _iso(_now())}
    stops[stop["id"]] = stop
    return {"summary": f"Stop payment recorded for cheque {number}", "stop_cheque": stop}, None


def _deposit(state, customer_id, customer, f, request_id):
    if not _kyc_ok(customer):
        return None, "Initial KYC must be verified before opening a deposit"
    source = _own_account(state, customer_id, f["account_id"])
    if not source:
        return None, "Funding account is not active or not owned by the customer"
    amount, tenure, recurring = int(f["amount_minor"]), int(f["tenure_months"]), f["deposit_type"] == "RECURRING"
    if amount <= 0:
        return None, "Deposit amount must be positive"
    if amount > (RD_AUTO_LIMIT_MINOR if recurring else FD_AUTO_LIMIT_MINOR):
        return None, "Amount is above the straight-through limit; an officer confirms large deposits"
    if source.get("available_balance_minor", 0) < amount:
        return None, "Insufficient available balance in the funding account"
    rate = (RD_RATES if recurring else FD_RATES).get(tenure, 7.00)
    opened = _now()
    maturity = date(opened.year + (opened.month - 1 + tenure) // 12, (opened.month - 1 + tenure) % 12 + 1, min(opened.day, 28))
    # Fixed: simple quarterly compounding estimate; recurring: sum of instalments with monthly accrual (illustrative).
    if recurring:
        maturity_minor = sum(int(amount * (1 + rate / 400) ** ((tenure - m) / 3)) for m in range(tenure))
    else:
        maturity_minor = int(amount * (1 + rate / 400) ** (tenure / 3))
    number = f"{len(state.get('accounts', {})) + 5001:04d}"
    deposit = {"id": f"ACC-{'RD' if recurring else 'FD'}-{request_id[-8:]}", "customer_id": customer_id,
               "name": f"Kosh Vriddhi {'Recurring' if recurring else 'Fixed'} Deposit", "type": "RECURRING_DEPOSIT" if recurring else "FIXED_DEPOSIT",
               "balance_minor": amount, "available_balance_minor": 0, "currency": "INR", "status": "ACTIVE",
               "account_number_masked": f"•••• {number}", "is_primary": False, "interest_rate": rate, "tenure_months": tenure,
               "opened_at": _iso(opened), "maturity_date": maturity.isoformat(), "maturity_amount_minor": maturity_minor,
               "maturity_instruction": f["maturity_instruction"], "funding_account_id": source["id"],
               "monthly_instalment_minor": amount if recurring else None}
    state.setdefault("accounts", {})[deposit["id"]] = deposit
    source["balance_minor"] -= amount
    source["available_balance_minor"] -= amount
    txns = state.setdefault("transactions", [])
    txns.insert(0, {"id": f"TXN-{request_id[-8:]}-D", "customer_id": customer_id, "account_id": source["id"], "created_at": _iso(opened),
                    "description": f"Transfer to {deposit['name']} {deposit['account_number_masked']}", "category": "DEPOSIT",
                    "amount_minor": -amount, "currency": "INR", "status": "COMPLETED", "reference": request_id})
    txns.insert(0, {"id": f"TXN-{request_id[-8:]}-C", "customer_id": customer_id, "account_id": deposit["id"], "created_at": _iso(opened),
                    "description": f"{'First instalment' if recurring else 'Deposit opened'} from {source['name']}", "category": "DEPOSIT",
                    "amount_minor": amount, "currency": "INR", "status": "COMPLETED", "reference": request_id})
    return {"summary": f"{deposit['name']} opened at {rate:.2f}% p.a., matures {maturity.isoformat()}", "deposit": deposit}, None


def _standing_instruction(state, customer_id, customer, f, request_id):
    if not _kyc_ok(customer):
        return None, "Initial KYC must be verified before setting up payments"
    source = _own_account(state, customer_id, f["account_id"])
    payee = state.get("beneficiaries", {}).get(f["beneficiary_id"])
    if not source:
        return None, "Debit account is not active or not owned by the customer"
    if not payee or payee.get("customer_id") != customer_id or payee.get("risk_status") != "NORMAL":
        return None, "Payee is not an active, unflagged payee of this customer"
    from sentinel import waiting_period_reason
    wait = waiting_period_reason(state, customer_id, payee)
    if wait:
        return None, wait
    amount = int(f["amount_minor"])
    if not 0 < amount <= SI_AUTO_LIMIT_MINOR:
        return None, "Instruction amount is above the straight-through limit"
    if f["end"] <= f["start"] or f["start"] < date.today().isoformat():
        return None, "Start date must be today or later and before the end date"
    si = {"id": f"SI-{request_id[-8:]}", "customer_id": customer_id, "account_id": source["id"], "beneficiary_id": payee["id"],
          "payee_name": payee["display_name"], "amount_minor": amount, "frequency": f["frequency"], "start": f["start"],
          "end": f["end"], "purpose": f.get("purpose", "")[:120], "status": "ACTIVE", "next_run": f["start"], "created_at": _iso(_now())}
    state.setdefault("standing_instructions", {})[si["id"]] = si
    return {"summary": f"{f['frequency'].title()} payment to {payee['display_name']} registered from {f['start']}", "standing_instruction": si}, None


def _certificate(state, customer_id, customer, f, request_id):
    account = _own_account(state, customer_id, f["account_id"])
    if not account:
        return None, "Account is not active or not owned by the customer"
    match = re.fullmatch(r"(20\d{2})-(20\d{2})", f["financial_year"])
    if not match or int(match.group(2)) != int(match.group(1)) + 1:
        return None, "Financial year must look like 2025-2026"
    start, end = f"{match.group(1)}-04-01", f"{match.group(2)}-03-31"
    rows = [t for t in state.get("transactions", []) if t.get("account_id") == account["id"] and start <= t["created_at"][:10] <= end]
    interest = [t for t in rows if t.get("category") == "INTEREST" or "interest" in t.get("description", "").lower()]
    tds = [t for t in rows if t.get("category") == "TDS" or "tds" in t.get("description", "").lower()]
    certificate = {"id": f"CRT-{request_id[-8:]}", "type": f["certificate_type"], "financial_year": f["financial_year"],
                   "account_id": account["id"], "account_masked": account["account_number_masked"],
                   "interest_credited_minor": sum(t["amount_minor"] for t in interest if t["amount_minor"] > 0),
                   "tds_deducted_minor": -sum(t["amount_minor"] for t in tds if t["amount_minor"] < 0),
                   "lines": [{"date": t["created_at"][:10], "description": t["description"], "amount_minor": t["amount_minor"]}
                             for t in (interest if f["certificate_type"] == "INTEREST" else tds)],
                   "generated_at": _iso(_now())}
    return {"summary": f"{f['certificate_type'].title()} certificate for FY {f['financial_year']} is ready to download",
            "certificate": certificate, "download": f"/api/portal/certificates/{request_id}.csv"}, None


def _statement(state, customer_id, customer, f, request_id):
    account = _own_account(state, customer_id, f["account_id"])
    if not account:
        return None, "Account is not active or not owned by the customer"
    start, end = f.get("start", ""), f.get("end", "")
    if start and end and start > end:
        return None, "From date cannot be after To date"
    txns = [t for t in state.get("transactions", [])
            if t.get("account_id") == account["id"]
            and (not start or t.get("created_at", "")[:10] >= start)
            and (not end or t.get("created_at", "")[:10] <= end)]
    summary = f"Statement for {account['name']} ({start or 'earliest'} to {end or 'latest'}) generated ({len(txns)} transactions)"
    download = f"/api/portal/statement.csv?account_id={account['id']}&start={start}&end={end}"
    return {"summary": summary, "account_id": account["id"], "transaction_count": len(txns), "download": download}, None


def _appointment(state, customer_id, customer, f, request_id):
    branch = f.get("branch", "FORT")
    date_str = f.get("appointment_date") or f.get("preferred_date", "")
    window = f.get("time_window") or f.get("preferred_window", "10:00–12:00")
    purpose = f.get("purpose") or f.get("details", "General banking services")
    if date_str and date_str < date.today().isoformat():
        return None, "Appointment date must be today or in the future"
    apts = state.setdefault("appointments", {})
    apt = {
        "id": f"APT-{request_id[-8:]}",
        "customer_id": customer_id,
        "branch": branch.replace("_", " ").title(),
        "appointment_date": date_str,
        "time_window": window,
        "purpose": purpose[:160],
        "status": "CONFIRMED",
        "created_at": _iso(_now()),
    }
    apts[apt["id"]] = apt
    return {"summary": f"Branch appointment booked at {apt['branch']} for {date_str} ({window})", "appointment": apt}, None


def _nominee_update(state, customer_id, customer, f, request_id):
    account = _own_account(state, customer_id, f["account_id"])
    if not account:
        return None, "Account is not active or not owned by the customer"
    name = (f.get("nominee_name") or "").strip()
    rel = f.get("relationship", "OTHER")
    if not name:
        return None, "Nominee full name is required"
    nominee = {
        "name": name,
        "relationship": rel,
        "dob": f.get("nominee_dob", ""),
        "address": f.get("nominee_address", ""),
        "guardian_name": f.get("guardian_name", ""),
        "updated_at": _iso(_now()),
        "reference_request_id": request_id,
    }
    account["nominee"] = nominee
    return {"summary": f"Nominee {name} ({rel.replace('_', ' ').title()}) registered for account {account['account_number_masked']}", "nominee": nominee}, None


HANDLERS = {
    "cheque_book": _cheque_book,
    "stop_cheque": _stop_cheque,
    "deposit": _deposit,
    "standing_instruction": _standing_instruction,
    "certificate": _certificate,
    "statement": _statement,
    "appointment": _appointment,
    "nominee_update": _nominee_update,
}


def fulfil(db, skill_id: str, customer_id: str, fields: Dict[str, Any], request_id: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """Run one STP handler atomically on the banking state. Returns (fulfilment, None) or (None, referral reason)."""
    handler = HANDLERS[skill_id]

    def mutate(state: Dict[str, Any]):
        customer = state.get("customers", {}).get(customer_id) or {}
        return handler(state, customer_id, customer, fields, request_id)

    try:
        return db.transaction(mutate)
    except Exception as exc:  # a handler bug must never lose the request; the officer still sees it
        return None, f"Automatic processing failed: {exc}"
