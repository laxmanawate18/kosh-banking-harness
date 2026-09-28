"""Server-owned forms and skill registry for Kosh assisted banking services."""
from pathlib import Path


def field(key, label, kind="text", *, choices=None, required=True, section="Details", **kwargs):
    return dict(key=key, label=label, kind=kind, choices=choices or [], required=required, section=section, **kwargs)


def choice(*values):
    return [[v, v.replace('_', ' ').title()] for v in values]


ACCOUNT = field("account_id", "Account", "account")
ADDRESS = [field("address", "Residential address", "textarea", section="Address"),
           field("city", "City", section="Address"), field("state", "State / union territory", section="Address"),
           field("pincode", "PIN code", section="Address", pattern=r"[1-9][0-9]{5}")]
OVDS = choice("AADHAAR", "PASSPORT", "VOTER_ID", "DRIVING_LICENSE", "NREGA_JOB_CARD", "NPR_LETTER")
WORKFLOWS = {
    "kyc": dict(name="KYC & re-KYC", skill="kyc_compliance", service_id="P1-17", level="L3", icon="security",
        description="Scan identity documents, review prefilled details and complete your declarations in one place.",
        outcome="A documented KYC application for officer verification", documents=True,
        fields=[field("update_type", "What would you like to do?", "select", choices=choice("INITIAL_KYC", "DETAILS_CHANGED", "NO_CHANGE"), section="Identity"),
            field("full_name", "Full name as on document", section="Identity"),
            field("date_of_birth", "Date of birth", "date", section="Identity"),
            field("pan_route", "PAN declaration", "select", choices=choice("PAN", "FORM_60"), section="Identity"),
            field("pan_number", "PAN", required=False, section="Identity", pattern=r"[A-Z]{5}[0-9]{4}[A-Z]"),
            field("form60_reason", "Reason for Form 60", "textarea", required=False, section="Identity"),
            field("identity_document", "Identity & address document", "select", choices=OVDS, section="Identity"),
            field("document_last4", "Document number — last four characters only", required=False, section="Identity"),
            field("document_expiry", "Document expiry (passport / driving licence)", "date", required=False, section="Identity"),
            *ADDRESS,
            field("occupation", "Occupation", "select", choices=choice("SALARIED", "SELF_EMPLOYED", "PROFESSIONAL", "STUDENT", "RETIRED", "HOMEMAKER", "OTHER"), section="Declarations"),
            field("annual_income_slab", "Annual income", "select", choices=[["UP_TO_5L","Up to ₹5 lakh"],["5L_TO_15L","₹5–15 lakh"],["15L_TO_50L","₹15–50 lakh"],["50L_PLUS","Above ₹50 lakh"]], section="Declarations"),
            field("source_of_funds", "Primary source of funds", "select", choices=choice("SALARY", "BUSINESS", "SAVINGS", "PENSION", "FAMILY", "OTHER"), section="Declarations"),
            field("tax_residency", "Tax residency", "select", choices=choice("INDIA_ONLY", "MULTIPLE_COUNTRIES", "OUTSIDE_INDIA"), section="Declarations"),
            field("foreign_tax_details", "Other tax countries and tax identification details", "textarea", required=False, section="Declarations"),
            field("us_person", "Are you a US person for tax purposes?", "select", choices=choice("YES", "NO"), section="Declarations"),
            field("pep_status", "Politically exposed person (you / family / close associate)", "select", choices=choice("YES", "NO"), section="Declarations"),
            field("pep_details", "PEP relationship and role", "textarea", required=False, section="Declarations")]),
    "address_update": dict(name="Update residential address", skill="address_update", service_id="P1-12", level="L3", icon="accounts", documents=True,
        description="Read address proof, check the extracted address and send a change request.", outcome="An address change request with supporting evidence",
        fields=[ACCOUNT, *ADDRESS, field("identity_document", "Address proof", "select", choices=OVDS), field("reason", "Reason for the change", "textarea")]),
    "nominee_update": dict(name="Add or update a nominee", skill="nominee_update", service_id="P1-14", level="L3", icon="beneficiaries", documents=False,
        description="Choose an account, enter nominee details and handle a minor nominee’s guardian.", outcome="A nominee instruction for bank review",
        fields=[ACCOUNT, field("nominee_name", "Nominee full name"), field("relationship", "Relationship", "select", choices=choice("SPOUSE","PARENT","CHILD","SIBLING","OTHER")),
            field("nominee_dob", "Nominee date of birth", "date"), field("nominee_address", "Nominee address", "textarea"), field("guardian_name", "Guardian full name (if nominee is under 18)", required=False)]),
    "cheque_book": dict(name="Request a cheque book", skill="cheque_services", service_id="P1-04", level="L2", icon="requests", documents=False,
        description="Choose your account, cheque leaves and delivery preference without repeated questions.", outcome="A tracked cheque book request; dispatch is confirmed by the bank",
        fields=[ACCOUNT, field("leaves", "Number of leaves", "select", choices=[["25","25 leaves"],["50","50 leaves"]]), field("delivery", "Delivery", "select", choices=choice("REGISTERED_ADDRESS","BRANCH_COLLECTION"))]),
    "stop_cheque": dict(name="Stop a cheque", skill="cheque_services", service_id="P1-05", level="L3", icon="security", documents=False,
        description="Review the exact cheque and account before sending a stop instruction.", outcome="A stop-cheque request; the bank must confirm the stop before it takes effect",
        fields=[ACCOUNT, field("cheque_number", "Six-digit cheque number", pattern=r"[0-9]{6}"), field("reason", "Reason", "select", choices=choice("LOST","STOLEN","ISSUED_IN_ERROR","OTHER"))]),
    "statement": dict(name="Download an account statement", skill="statements_certificates", service_id="P1-03", level="L2", icon="download", documents=False,
        description="Select an account and dates for an immediate statement from recorded transactions.", outcome="A downloadable CSV statement",
        fields=[ACCOUNT, field("start", "From", "date"), field("end", "To", "date")]),
    "certificate": dict(name="Request a tax or interest certificate", skill="statements_certificates", service_id="P1-21", level="L2", icon="download", documents=False,
        description="Choose a certificate and financial year, then track its preparation.", outcome="A certificate request; no tax amounts or certificates are fabricated",
        fields=[ACCOUNT, field("certificate_type", "Certificate", "select", choices=choice("TDS","INTEREST")), field("financial_year", "Financial year", pattern=r"20[0-9]{2}-20[0-9]{2}")]),
    "deposit": dict(name="Apply for a fixed or recurring deposit", skill="deposit_application", service_id="P1-19", level="L3", icon="deposits", documents=False,
        description="Set an amount, term and maturity preference for a deposit application.", outcome="An application; rates and booking need bank confirmation and no money is debited",
        fields=[ACCOUNT, field("deposit_type", "Deposit", "select", choices=choice("FIXED","RECURRING")), field("amount", "Amount in INR (monthly for recurring)", "money"),
            field("tenure_months", "Term", "select", choices=[[str(n),f"{n} months"] for n in [6,12,24,36,60]]), field("maturity_instruction", "At maturity", "select", choices=choice("CREDIT_ACCOUNT","RENEW_PRINCIPAL","RENEW_PRINCIPAL_AND_INTEREST"))]),
    "standing_instruction": dict(name="Set up a regular payment", skill="standing_instructions", service_id="P2-10", level="L3", icon="payments", documents=False,
        description="Choose a saved payee, schedule and amount, then review a precise mandate.", outcome="A mandate request; recurring payments start only after the bank activates it",
        fields=[ACCOUNT, field("beneficiary_id", "Saved beneficiary", "beneficiary"), field("amount", "Amount in INR", "money"), field("frequency", "Frequency", "select", choices=choice("MONTHLY","QUARTERLY")),
            field("start", "First payment date", "date"), field("end", "Last payment date", "date"), field("purpose", "Payment purpose")]),
    "appointment": dict(name="Arrange a branch appointment", skill="branch_appointment", service_id="P1-23", level="L2", icon="calendar", documents=False,
        description="Choose your branch, a preferred time and what you need help with.", outcome="A preferred appointment request, subject to branch confirmation",
        fields=[field("branch", "Branch", "select", choices=choice("WORLI","BANDRA","FORT")), field("appointment_date", "Preferred date", "date"), field("time_window", "Preferred time", "select", choices=[["10:00–12:00","10 am–12 pm"],["12:00–14:00","12–2 pm"],["14:00–16:00","2–4 pm"]]), field("purpose", "What can we help with?", "textarea")]),
    "account_opening": dict(name="Open a new savings account", skill="account_opening", service_id="P1-25", level="L3", icon="accounts", documents=True,
        description="Open an individual savings account with automated CBS entry upon officer verification.",
        outcome="A verified account opening application for officer approval and CBS entry",
        fields=[
            field("account_scheme", "Account scheme", "select", choices=[["SAVINGS_INDIVIDUAL", "Regular Savings Account"], ["SALARY_PRIVILEGE", "Salary Privilege Account"]], section="Account"),
            field("full_name", "Full name as on PAN/Aadhaar", section="Identity"),
            field("date_of_birth", "Date of birth", "date", section="Identity"),
            field("pan_number", "PAN number", section="Identity", pattern=r"[A-Z]{5}[0-9]{4}[A-Z]"),
            field("mobile", "Mobile number", "text", section="Identity", pattern=r"[0-9]{10}"),
            field("email", "Email address", "text", section="Identity"),
            field("identity_document", "Identity & address proof", "select", choices=OVDS, section="Identity"),
            field("document_last4", "Document number — last 4 digits only", section="Identity"),
            *ADDRESS,
            field("nominee_name", "Nominee full name", section="Nominee", required=False),
            field("nominee_relationship", "Nominee relationship", "select", choices=choice("SPOUSE", "PARENT", "CHILD", "SIBLING", "OTHER"), section="Nominee", required=False),
            field("initial_deposit_minor", "Initial deposit (paise)", "text", section="Account", required=False),
        ]),
}


def catalogue():
    return [dict(id=k, category="AI", **v) for k,v in WORKFLOWS.items()]


def workflow_summary_prompt() -> str:
    """Compact index of available workflows (~500 tokens) instead of full 19KB markdown dump."""
    lines = [
        "Available Interactive Banking Workflows (call start_banking_workflow(skill_id) or start_account_opening() to display form):"
    ]
    for key, wf in sorted(WORKFLOWS.items()):
        if key == "account_opening":
            lines.append(f'- "{key}": {wf["name"]} — {wf["description"]} (invoke with start_account_opening())')
        else:
            lines.append(f'- "{key}": {wf["name"]} — {wf["description"]} (invoke with start_banking_workflow("{key}"))')
    return "\n".join(lines)


CORE_SKILLS = {
    "fund_transfers": dict(
        name="Payments & Fund Transfers",
        skill="fund_transfers",
        description="Safe payee lookup, integer paise conversion, and reviewed transfer proposals via the Kavach approval dialog.",
    ),
    "account_insights": dict(
        name="Account Balances & Activity",
        skill="account_insights",
        description="Account balances, CBS transaction history, outstanding utility bills, and spending analytics.",
    ),
    "card_security": dict(
        name="Card Security & Controls",
        skill="card_security",
        description="Debit card security alerts, temporary freezing, and suspicious charge management.",
    ),
}


def load_skill_instructions(skill_id_or_key: str) -> str:
    """Load the full markdown instruction for a single specific workflow or skill on demand."""
    root = Path(__file__).parent / "skills"
    skill_name = CORE_SKILLS.get(skill_id_or_key, {}).get("skill") or WORKFLOWS.get(skill_id_or_key, {}).get("skill", skill_id_or_key)
    skill_file = root / skill_name / "SKILL.md"
    if skill_file.exists():
        return skill_file.read_text()
    return ""


def detect_workflow_skill(text: str) -> str | None:
    """Detect if a user prompt is asking about or triggering a specific workflow skill."""
    if not text:
        return None
    lowered = text.casefold()
    if any(k in lowered for k in ("transfer", "send ₹", "send inr", "send money", "send rs", "send rupees", "pay rahul", "pay vikram", "pay priya", "payee", "pay bill", "bill payment", "electricity bill")):
        return "fund_transfers"
    if any(k in lowered for k in ("balance", "how much money", "account summary", "money at a glance", "spending", "spent", "recent transactions", "transaction history", "recent activity")):
        return "account_insights"
    if any(k in lowered for k in ("freeze", "block card", "lost card", "security alert", "suspicious", "unusual charge")):
        return "card_security"
    if any(k in lowered for k in ("kyc", "re-kyc", "aadhaar", "pan card", "pan verification")):
        return "kyc"
    if any(k in lowered for k in ("open account", "open an account", "new account", "savings account opening", "open savings")):
        return "account_opening"
    if any(k in lowered for k in ("address", "relocate", "moved house", "change address")):
        return "address_update"
    if any(k in lowered for k in ("nominee", "beneficiary nominee", "guardian")):
        return "nominee_update"
    if any(k in lowered for k in ("cheque book", "checkbook", "stop cheque", "cheque")):
        return "cheque_book" if "stop" not in lowered else "stop_cheque"
    if any(k in lowered for k in ("tax certificate", "tds certificate", "interest certificate")):
        return "certificate"
    if any(k in lowered for k in ("bank statement", "download statement")):
        return "statement"
    if any(k in lowered for k in ("fixed deposit", "recurring deposit", "term deposit", "open deposit")):
        return "deposit"
    if any(k in lowered for k in ("standing instruction", "recurring payment", "auto pay", "mandate")):
        return "standing_instruction"
    if any(k in lowered for k in ("appointment", "visit branch", "branch visit", "meet officer")):
        return "appointment"
    return None


def skill_instructions(skill_id: str | None = None, full: bool = False) -> str:
    """Load workflow skill instructions.

    Defaults to the compact workflow summary (~500 tokens) for system prompt efficiency.
    If skill_id is specified, returns only that specific skill's instructions.
    If full is True, returns all 9 skills concatenated (legacy compatibility).
    """
    if skill_id:
        return load_skill_instructions(skill_id)
    if full:
        root = Path(__file__).parent / "skills"
        return "\n\n".join((root / name / "SKILL.md").read_text() for name in sorted({v['skill'] for v in WORKFLOWS.values()}))
    return workflow_summary_prompt()
