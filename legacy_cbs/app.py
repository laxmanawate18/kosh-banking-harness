"""The legacy core's screens. HTML forms only, no API: an operator (or the robot) signs in, keys a record as maker, and a
different operator authorises it as checker. Every element the robot uses has a stable id."""

from __future__ import annotations

import hmac
import os
import re
import secrets
from html import escape
from typing import Optional

from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import select

from legacy_cbs import store
from legacy_cbs.store import Account, Customer, Deposit

app = FastAPI(title="Kosh Core Banking (legacy)", docs_url=None, redoc_url=None, openapi_url=None)
COOKIE = "CBSSESSION"
_sessions: dict[str, tuple[str, str]] = {}  # token -> (operator id, role); one process serves the core
SCHEMES = {"SB_GEN_IND": "Savings Individual", "SB_SAL_IND": "Salary Privilege"}
MATURITY = {"RENEW_PRINCIPAL_INTEREST": "Renew principal and interest", "RENEW_PRINCIPAL": "Renew principal, pay interest",
            "CLOSE_AND_CREDIT": "Close and credit the funding account"}
RELATIONSHIPS = ["SPOUSE", "FATHER", "MOTHER", "SON", "DAUGHTER", "BROTHER", "SISTER", "OTHER"]
FD_RATE_BP = 810  # matches the published Kosh Vriddhi Smart FD rate


def _operators() -> dict[str, tuple[str, str]]:
    """Operator id -> (password, role). Passwords come from the environment; production refuses to run without them."""
    production = os.getenv("ENVIRONMENT", "").lower() in {"production", "prod"}
    found = {}
    for operator, role, variable, default in (("RPA-MAKER", "MAKER", "LEGACY_CBS_MAKER_PASSWORD", "maker-demo"),
                                              ("RPA-CHECKER", "CHECKER", "LEGACY_CBS_CHECKER_PASSWORD", "checker-demo")):
        password = os.getenv(variable) or (None if production else default)
        if password is None:
            raise RuntimeError(f"{variable} must be set in production")
        found[operator] = (password, role)
    return found


def _page(title: str, body: str, operator: Optional[tuple[str, str]] = None, status_code: int = 200) -> HTMLResponse:
    who = (f'<span id="lblOperator">{escape(operator[0])} ({escape(operator[1])})</span> · <a id="lnkMenu" href="/menu">Menu</a>'
           f' · <a id="lnkLogout" href="/logout">Sign out</a>') if operator else ""
    return HTMLResponse(f"""<!DOCTYPE html><html><head><title>{escape(title)} - Kosh Core Banking</title><style>
body{{font:13px Tahoma,Verdana,sans-serif;margin:0;background:#d4d0c8}} header{{background:#0a246a;color:#fff;padding:6px 12px}}
header b{{font-size:15px}} header a{{color:#fff}} main{{padding:14px}} fieldset{{background:#ece9d8;border:1px solid #808080;margin-bottom:10px}}
label{{display:inline-block;width:220px}} input,select{{width:260px;margin:3px 0}} table{{border-collapse:collapse;background:#fff}}
td,th{{border:1px solid #808080;padding:3px 8px}} .err{{background:#ffe0e0;border:1px solid #c00;padding:8px;margin-bottom:10px}}
.ok{{background:#e0ffe0;border:1px solid #070;padding:8px;margin-bottom:10px}} a{{color:#0a246a}}</style></head>
<body><header><b>KOSH CORE BANKING</b> &nbsp;legacy retail core · demo system, not a real bank &nbsp;<span style="float:right">{who}</span></header>
<main><h3>{escape(title)}</h3>{body}</main></body></html>""", status_code=status_code)


def _error(title: str, message: str, operator) -> HTMLResponse:
    return _page(title, f'<div id="errorBanner" class="err">{escape(message)}</div>', operator)


def _operator(request: Request) -> Optional[tuple[str, str]]:
    return _sessions.get(request.cookies.get(COOKIE, ""))


def _field(label: str, field_id: str, name: str, value: str = "", kind: str = "input", options: Optional[dict] = None) -> str:
    if kind == "select":
        opts = "".join(f'<option value="{escape(k)}">{escape(v)}</option>' for k, v in (options or {}).items())
        control = f'<select id="{field_id}" name="{name}">{opts}</select>'
    else:
        control = f'<input id="{field_id}" name="{name}" value="{escape(value)}" />'
    return f'<div><label for="{field_id}">{escape(label)}</label>{control}</div>'


def _signed_in(request: Request, role: Optional[str] = None):
    operator = _operator(request)
    if not operator:
        return None, RedirectResponse("/login", status_code=303)
    if role and operator[1] != role:
        return operator, _error("Not permitted", f"This function needs a {role} operator. Signed in as {operator[1]}.", operator)
    return operator, None


# ---- sign-in ---------------------------------------------------------------------------------------------------
@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return RedirectResponse("/menu" if _operator(request) else "/login", status_code=303)


@app.get("/login", response_class=HTMLResponse)
async def login_form():
    return _page("Operator sign-in", '<form id="frmLogin" method="post" action="/login"><fieldset>'
                 + _field("Operator ID", "txtOperatorId", "operator_id") + '<div><label for="txtPassword">Password</label>'
                 '<input id="txtPassword" name="password" type="password" /></div>'
                 '<button id="btnLogin" type="submit">Sign in</button></fieldset></form>')


@app.post("/login", response_class=HTMLResponse)
async def login(operator_id: str = Form(""), password: str = Form("")):
    known = _operators().get(operator_id.strip().upper())
    if not known or not hmac.compare_digest(known[0].encode(), password.encode()):
        return _error("Operator sign-in", "Invalid operator ID or password.", None)
    token = secrets.token_urlsafe(32)
    _sessions[token] = (operator_id.strip().upper(), known[1])
    response = RedirectResponse("/menu", status_code=303)
    response.set_cookie(COOKIE, token, httponly=True, samesite="strict")
    return response


@app.get("/logout", response_class=HTMLResponse)
async def logout(request: Request):
    _sessions.pop(request.cookies.get(COOKIE, ""), None)
    return RedirectResponse("/login", status_code=303)


@app.get("/menu", response_class=HTMLResponse)
async def menu(request: Request):
    operator, refusal = _signed_in(request)
    if refusal:
        return refusal
    return _page("Main menu", '<ul id="mnuMain"><li><a id="lnkEnquiry" href="/enquiry">Enquiry</a></li>'
                 '<li><a id="lnkNewCustomer" href="/customer/new">New customer (CIF)</a> · maker</li>'
                 '<li><a id="lnkNewAccount" href="/account/new">Open savings account</a> · maker</li>'
                 '<li><a id="lnkNewDeposit" href="/deposit/new">Book fixed deposit</a> · maker</li>'
                 '<li><a id="lnkAuthorise" href="/authorise">Authorise pending records</a> · checker</li></ul>', operator)


# ---- enquiry ---------------------------------------------------------------------------------------------------
def _records(session, ref: str = "", pan: str = "", cif: str = "") -> list[tuple[str, str, str, str]]:
    """(kind, number, cif, status) for everything matching a reference, a PAN or a CIF."""
    rows = []
    customers = []
    if pan:
        customers += list(session.scalars(select(Customer).where(Customer.pan == pan)))
    if cif:
        customers += list(session.scalars(select(Customer).where(Customer.cif == cif)))
    if ref:
        customers += list(session.scalars(select(Customer).where(Customer.portal_ref == ref)))
    for c in {c.cif: c for c in customers}.values():
        rows.append(("CUSTOMER", c.cif, c.cif, c.status))
    accounts = select(Account).where(Account.portal_ref == ref) if ref else select(Account).where(Account.cif.in_([c.cif for c in customers]))
    rows += [("ACCOUNT", a.account_number, a.cif, a.status) for a in session.scalars(accounts)]
    deposits = select(Deposit).where(Deposit.portal_ref == ref) if ref else select(Deposit).where(Deposit.cif.in_([c.cif for c in customers]))
    rows += [("DEPOSIT", d.fd_number, d.cif, d.status) for d in session.scalars(deposits)]
    return rows


@app.get("/enquiry", response_class=HTMLResponse)
async def enquiry(request: Request, ref: str = "", pan: str = "", cif: str = ""):
    operator, refusal = _signed_in(request)
    if refusal:
        return refusal
    ref, pan, cif = ref.strip().upper(), pan.strip().upper(), cif.strip().upper()
    form = ('<form id="frmEnquiry" method="get" action="/enquiry"><fieldset>' + _field("External reference", "txtExtRef", "ref", ref)
            + _field("PAN", "txtPanNo", "pan", pan) + _field("CIF", "txtCif", "cif", cif)
            + '<button id="btnSearch" type="submit">Search</button></fieldset></form>')
    if not (ref or pan or cif):
        return _page("Enquiry", form, operator)
    with store.sessions()() as session:
        rows = _records(session, ref, pan, cif)
    body = "".join(f'<tr class="result-row" data-kind="{k}" data-number="{n}" data-cif="{c}" data-status="{s}">'
                   f"<td>{k}</td><td>{n}</td><td>{c}</td><td>{s}</td></tr>" for k, n, c, s in rows)
    found = (f'<table id="tblResults"><tr><th>Type</th><th>Number</th><th>CIF</th><th>Status</th></tr>{body}</table>'
             if rows else '<div id="lblNoRecords">No records found.</div>')
    return _page("Enquiry", form + f'<div id="lblResultCount">{len(rows)}</div>' + found, operator)


# ---- maker: customer, account, deposit -------------------------------------------------------------------------
@app.get("/customer/new", response_class=HTMLResponse)
async def customer_form(request: Request):
    operator, refusal = _signed_in(request, "MAKER")
    if refusal:
        return refusal
    fields = [("Customer name", "txtCustName", "customerName"), ("Permanent Account Number", "txtPanNo", "panNumber"),
              ("Date of birth (DD/MM/YYYY)", "txtDob", "dateOfBirth"), ("Mobile number", "txtMobile", "mobileNumber"),
              ("E-mail", "txtEmail", "email"), ("Address", "txtAddress", "residentialAddress"), ("City", "txtCity", "city"),
              ("PIN code", "txtPin", "pincode"), ("External reference", "txtExtRef", "portalReference")]
    return _page("New customer (CIF) - maker", '<form id="frmCustomer" method="post" action="/customer/new"><fieldset>'
                 + "".join(_field(*f) for f in fields) + '<button id="btnSaveCustomer" type="submit">Save for authorisation</button>'
                 "</fieldset></form>", operator)


_FORMATS = {"panNumber": r"[A-Z]{5}[0-9]{4}[A-Z]", "dateOfBirth": r"\d{2}/\d{2}/\d{4}", "mobileNumber": r"[6-9]\d{9}",
            "pincode": r"[1-9]\d{5}", "email": r"[^@\s]+@[^@\s]+\.[^@\s]+", "customerName": r"[A-Z .']{2,100}",
            "residentialAddress": r"[A-Z0-9 ,./#-]{5,200}", "city": r"[A-Z .]{2,50}", "portalReference": r"[A-Z0-9-]{6,40}"}


@app.post("/customer/new", response_class=HTMLResponse)
async def customer_save(request: Request, customerName: str = Form(""), panNumber: str = Form(""), dateOfBirth: str = Form(""),
                        mobileNumber: str = Form(""), email: str = Form(""), residentialAddress: str = Form(""),
                        city: str = Form(""), pincode: str = Form(""), portalReference: str = Form("")):
    operator, refusal = _signed_in(request, "MAKER")
    if refusal:
        return refusal
    values = {"customerName": customerName.strip().upper(), "panNumber": panNumber.strip().upper(), "dateOfBirth": dateOfBirth.strip(),
              "mobileNumber": mobileNumber.strip(), "email": email.strip().lower(), "residentialAddress": residentialAddress.strip().upper(),
              "city": city.strip().upper(), "pincode": pincode.strip(), "portalReference": portalReference.strip().upper()}
    bad = [name for name, pattern in _FORMATS.items() if not re.fullmatch(pattern, values[name], re.I)]
    if bad:
        return _error("New customer (CIF) - maker", f"Invalid fields: {', '.join(bad)}", operator)
    with store.numbering, store.sessions().begin() as session:
        existing = session.scalar(select(Customer).where(Customer.pan == values["panNumber"]))
        if existing:
            return _error("New customer (CIF) - maker", f"DUPLICATE PAN: customer {existing.cif} already exists for this PAN.", operator)
        cif = store.next_number(session, Customer.cif, "CIF", 7, 1003)
        session.add(Customer(cif=cif, full_name=values["customerName"], pan=values["panNumber"], dob=values["dateOfBirth"],
                             mobile=values["mobileNumber"], email=values["email"], address=values["residentialAddress"],
                             city=values["city"], pincode=values["pincode"], portal_ref=values["portalReference"], made_by=operator[0]))
    return _page("New customer (CIF) - maker", f'<div id="confirmationBanner" class="ok">Customer saved for authorisation.<br>'
                 f'CIF: <b id="lblCifNumber">{cif}</b><br>Status: <span id="lblStatus">PENDING_AUTH</span><br>'
                 f'Reference: <span id="lblExtRef">{escape(values["portalReference"])}</span></div>', operator)


@app.get("/account/new", response_class=HTMLResponse)
async def account_form(request: Request, cif: str = ""):
    operator, refusal = _signed_in(request, "MAKER")
    if refusal:
        return refusal
    return _page("Open savings account - maker", '<form id="frmAccount" method="post" action="/account/new"><fieldset>'
                 + _field("CIF", "txtCif", "cif", cif.upper()) + _field("Scheme code", "ddlScheme", "schemeCode", kind="select", options=SCHEMES)
                 + _field("Nominee name", "txtNominee", "nomineeName")
                 + _field("Nominee relationship", "ddlNomineeRel", "nomineeRelationship", kind="select", options={r: r for r in RELATIONSHIPS})
                 + _field("External reference", "txtExtRef", "portalReference")
                 + '<button id="btnSaveAccount" type="submit">Save for authorisation</button></fieldset></form>', operator)


@app.post("/account/new", response_class=HTMLResponse)
async def account_save(request: Request, cif: str = Form(""), schemeCode: str = Form(""), nomineeName: str = Form(""),
                       nomineeRelationship: str = Form(""), portalReference: str = Form("")):
    operator, refusal = _signed_in(request, "MAKER")
    if refusal:
        return refusal
    cif, ref = cif.strip().upper(), portalReference.strip().upper()
    if schemeCode not in SCHEMES or not re.fullmatch(_FORMATS["portalReference"], ref):
        return _error("Open savings account - maker", "Invalid scheme code or external reference.", operator)
    with store.numbering, store.sessions().begin() as session:
        if not session.get(Customer, cif):
            return _error("Open savings account - maker", f"CIF {cif} not found.", operator)
        if session.scalar(select(Account.account_number).where(Account.portal_ref == ref)):
            return _error("Open savings account - maker", f"DUPLICATE REFERENCE: an account already exists for {ref}.", operator)
        number = store.next_number(session, Account.account_number, "1092", 8, 10001)
        session.add(Account(account_number=number, cif=cif, scheme_code=schemeCode, portal_ref=ref, made_by=operator[0],
                            nominee_name=nomineeName.strip().upper() or None,
                            nominee_relationship=nomineeRelationship if nomineeName.strip() else None))
    return _page("Open savings account - maker", f'<div id="confirmationBanner" class="ok">Account saved for authorisation.<br>'
                 f'Account: <b id="lblAcctNumber">{number}</b><br>CIF: <span id="lblCifNumber">{cif}</span><br>'
                 f'Status: <span id="lblStatus">PENDING_AUTH</span><br>Reference: <span id="lblExtRef">{escape(ref)}</span></div>', operator)


@app.get("/deposit/new", response_class=HTMLResponse)
async def deposit_form(request: Request, cif: str = ""):
    operator, refusal = _signed_in(request, "MAKER")
    if refusal:
        return refusal
    return _page("Book fixed deposit - maker", '<form id="frmDeposit" method="post" action="/deposit/new"><fieldset>'
                 + _field("CIF", "txtCif", "cif", cif.upper()) + _field("Funding account", "txtFundingAcct", "fundingAccount")
                 + _field("Amount (Rs, e.g. 25000.00)", "txtAmount", "amount") + _field("Tenure (months)", "txtTenure", "tenureMonths")
                 + _field("On maturity", "ddlMaturity", "maturityInstruction", kind="select", options=MATURITY)
                 + _field("External reference", "txtExtRef", "portalReference")
                 + '<button id="btnSaveDeposit" type="submit">Save for authorisation</button></fieldset></form>', operator)


@app.post("/deposit/new", response_class=HTMLResponse)
async def deposit_save(request: Request, cif: str = Form(""), fundingAccount: str = Form(""), amount: str = Form(""),
                       tenureMonths: str = Form(""), maturityInstruction: str = Form(""), portalReference: str = Form("")):
    operator, refusal = _signed_in(request, "MAKER")
    if refusal:
        return refusal
    cif, funding, ref = cif.strip().upper(), fundingAccount.strip(), portalReference.strip().upper()
    if not re.fullmatch(r"\d{1,10}\.\d{2}", amount.strip()) or not tenureMonths.strip().isdigit() \
            or not 6 <= int(tenureMonths) <= 120 or maturityInstruction not in MATURITY or not re.fullmatch(_FORMATS["portalReference"], ref):
        return _error("Book fixed deposit - maker", "Invalid amount (Rs 0.00), tenure (6-120 months), maturity or reference.", operator)
    paise = int(amount.strip().replace(".", ""))
    if paise <= 0:
        return _error("Book fixed deposit - maker", "Amount must be more than zero.", operator)
    with store.numbering, store.sessions().begin() as session:
        account = session.get(Account, funding)
        if not account or account.cif != cif or account.status != "ACTIVE":
            return _error("Book fixed deposit - maker", f"Funding account {funding} is not an active account of CIF {cif}.", operator)
        if session.scalar(select(Deposit.fd_number).where(Deposit.portal_ref == ref)):
            return _error("Book fixed deposit - maker", f"DUPLICATE REFERENCE: a deposit already exists for {ref}.", operator)
        number = store.next_number(session, Deposit.fd_number, "FD", 10, 1043)
        session.add(Deposit(fd_number=number, cif=cif, funding_account=funding, amount_paise=paise, tenure_months=int(tenureMonths),
                            rate_bp=FD_RATE_BP, maturity_instruction=maturityInstruction, portal_ref=ref, made_by=operator[0]))
    return _page("Book fixed deposit - maker", f'<div id="confirmationBanner" class="ok">Deposit saved for authorisation.<br>'
                 f'Deposit: <b id="lblFdNumber">{number}</b><br>CIF: <span id="lblCifNumber">{cif}</span><br>'
                 f'Rate: <span id="lblRate">{FD_RATE_BP / 100:.2f}</span>% p.a.<br>Status: <span id="lblStatus">PENDING_AUTH</span><br>'
                 f'Reference: <span id="lblExtRef">{escape(ref)}</span></div>', operator)


# ---- checker ---------------------------------------------------------------------------------------------------
@app.get("/authorise", response_class=HTMLResponse)
async def authorise_form(request: Request, ref: str = ""):
    operator, refusal = _signed_in(request, "CHECKER")
    if refusal:
        return refusal
    ref = ref.strip().upper()
    pending = ""
    if ref:
        with store.sessions()() as session:
            rows = [r for r in _records(session, ref=ref) if r[3] == "PENDING_AUTH"]
        pending = (f'<table id="tblPending"><tr><th>Type</th><th>Number</th><th>CIF</th></tr>'
                   + "".join(f'<tr class="pending-row" data-kind="{k}" data-number="{n}"><td>{k}</td><td>{n}</td><td>{c}</td></tr>'
                             for k, n, c, _ in rows) + "</table>") if rows else '<div id="lblNoRecords">Nothing pending for this reference.</div>'
    return _page("Authorise pending records - checker", '<form id="frmAuthorise" method="post" action="/authorise"><fieldset>'
                 + _field("External reference", "txtExtRef", "portalReference", ref)
                 + '<button id="btnAuthorise" type="submit">Authorise all pending for this reference</button></fieldset></form>'
                 + pending, operator)


@app.post("/authorise", response_class=HTMLResponse)
async def authorise(request: Request, portalReference: str = Form("")):
    operator, refusal = _signed_in(request, "CHECKER")
    if refusal:
        return refusal
    ref = portalReference.strip().upper()
    with store.sessions().begin() as session:
        pending = [r for model in (Customer, Account, Deposit)
                   for r in session.scalars(select(model).where(model.portal_ref == ref, model.status == "PENDING_AUTH"))]
        if not pending:
            return _error("Authorise pending records - checker", f"Nothing pending authorisation for {ref}.", operator)
        if any(record.made_by == operator[0] for record in pending):  # the core's own maker-checker rule
            return _error("Authorise pending records - checker", "MAKER-CHECKER: you cannot authorise a record you made.", operator)
        at = store.now()
        for record in pending:
            record.status, record.authorised_by, record.authorised_at = "ACTIVE", operator[0], at
        checker_ref = f"AUTH{secrets.token_hex(4).upper()}"
        numbers = {type(r).__name__: getattr(r, {"Customer": "cif", "Account": "account_number", "Deposit": "fd_number"}[type(r).__name__])
                   for r in pending}
        cif = next((getattr(r, "cif") for r in pending), "")
    labels = "".join(f'{label}: <b id="{element}">{numbers[kind]}</b><br>' for kind, label, element in
                     (("Customer", "CIF", "lblNewCif"), ("Account", "Account", "lblAcctNumber"), ("Deposit", "Deposit", "lblFdNumber"))
                     if kind in numbers)
    return _page("Authorise pending records - checker", f'<div id="confirmationBanner" class="ok">Authorised {len(pending)} record(s).<br>'
                 f'{labels}CIF: <span id="lblCifNumber">{cif}</span><br>Authorisation: <span id="lblCheckerRef">{checker_ref}</span><br>'
                 f'Status: <span id="lblStatus">ACTIVE</span><br>Reference: <span id="lblExtRef">{escape(ref)}</span></div>', operator)
