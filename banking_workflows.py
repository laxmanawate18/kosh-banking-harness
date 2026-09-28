"""Durable, customer-reviewed skill workflows. Agents suggest; trusted routes submit."""
from __future__ import annotations
import copy
import hashlib
import json
import re
from datetime import date, timedelta
from decimal import Decimal
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from banking_db import new_id
from document_processing import CloudDocumentScanner, DOCUMENT_TYPES, basic_fields, cipher, redact, validate_file
from persistence import BankingStateRecord, BankingWorkflowRecord, ServiceRequestRecord, utc_dt
from backend.stp import STP_SKILLS, fulfil as stp_fulfil
from workflow_catalogue import WORKFLOWS, catalogue

POLICY_VERSION = "workflow-2026-09-v1"


class Body(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class StartBody(Body):
    skill_id: str = Field(max_length=80)


class SaveBody(Body):
    revision: int
    fields: dict[str, str] = Field(max_length=30)


class UploadBody(Body):
    revision: int
    document_type: str
    name: str = Field(max_length=160)
    mime_type: str
    data_base64: str = Field(max_length=11_200_000)
    consent: bool


class SubmitBody(Body):
    revision: int
    review_digest: str = Field(min_length=64, max_length=64)
    confirmed: bool


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


class WorkflowService:
    def __init__(self, db):
        self.db = db
        self.scanner = CloudDocumentScanner()

    def owned(self, session, workflow_id, customer_id, lock=False):
        q = select(BankingWorkflowRecord).where(BankingWorkflowRecord.id == workflow_id,
                                                BankingWorkflowRecord.customer_id == customer_id)
        row = session.scalar(q.with_for_update() if lock else q)
        if not row:
            raise HTTPException(404, "Workflow not found")
        return row

    def editable(self, row, revision=None):
        if row.status != "DRAFT":
            raise HTTPException(409, "This workflow is already submitted or cancelled")
        if revision is not None and row.revision != revision:
            raise HTTPException(409, "This form has changed. Reload it before continuing")

    def view(self, row):
        payload = row.payload
        documents = [{k:v for k,v in d.items() if k not in {"encrypted_content", "text"}} for d in payload.get("documents", [])]
        return {"id": row.id, "skill_id": row.skill_id, "name": WORKFLOWS[row.skill_id]["name"], "status": row.status,
                "revision": row.revision, "fields": payload.get("fields", {}), "sources": payload.get("sources", {}),
                "documents": documents, "checks": self.checks(row), "request_id": row.request_id,
                "review_digest": payload.get("review_digest"), "review_expires_at": payload.get("review_expires_at"),
                "outcome": WORKFLOWS[row.skill_id]["outcome"], "download": payload.get("download"),
                "fulfilment_summary": (payload.get("fulfilment") or {}).get("summary"),
                "updated_at": row.updated_at.isoformat(), "presentation": {"type": "BANKING_WORKFLOW", "workflow_id": row.id}}

    def audit(self, session, row, event_type, summary):
        session.scalar(select(BankingStateRecord).where(BankingStateRecord.id == 1).with_for_update())
        self.db._persist_audit(session, {"id": new_id("AUD"), "event_type": event_type,
            "customer_id": row.customer_id, "actor": "customer", "service_id": WORKFLOWS[row.skill_id]["service_id"],
            "approval_request_id": row.request_id, "summary": summary, "details": {"user_id": row.user_id,
            "workflow_id": row.id, "revision": row.revision, "policy_version": POLICY_VERSION}})

    def start(self, customer_id, user_id, skill_id):
        if skill_id not in WORKFLOWS:
            raise HTTPException(404, "Unknown banking workflow")
        with self.db._lock, self.db.runtime.sessions.begin() as session:
            # Serialize starts across workers as well as concurrent browser clicks.
            session.scalar(select(BankingStateRecord).where(BankingStateRecord.id == 1).with_for_update())
            row = session.scalar(select(BankingWorkflowRecord).where(BankingWorkflowRecord.customer_id == customer_id,
                BankingWorkflowRecord.skill_id == skill_id, BankingWorkflowRecord.status == "DRAFT"))
            if row:
                return self.view(row)
            customer = self.db.get_customer(customer_id) or {}
            kyc = self.db.get_kyc_profile(customer_id)
            if skill_id == "kyc" and kyc.get("pending_request_id"):
                raise HTTPException(409, "Your KYC is already with the banking team. See Your requests for its status")
            allowed = {f["key"] for f in WORKFLOWS[skill_id]["fields"]}
            defaults = {k:v for k,v in kyc.items() if k in allowed and isinstance(v, str)}
            for spec in WORKFLOWS[skill_id]["fields"]:
                if spec["choices"] and defaults.get(spec["key"]) not in {c[0] for c in spec["choices"]}:
                    defaults.pop(spec["key"], None)
            defaults.pop("pan_number", None)
            if "full_name" in allowed:
                defaults["full_name"] = customer.get("full_name") or customer.get("display_name", "")
            if skill_id == "kyc":
                defaults["update_type"] = "INITIAL_KYC" if kyc.get("status") == "NOT_DONE" else "DETAILS_CHANGED"
                # Declarations must be explicitly reconfirmed in each application.
                for key in ("tax_residency", "us_person", "pep_status"):
                    defaults.pop(key, None)
            row = BankingWorkflowRecord(id=new_id("WF"), customer_id=customer_id, user_id=user_id, skill_id=skill_id,
                status="DRAFT", revision=1, payload={"fields": defaults, "sources": {k:"BANK_PROFILE" for k in defaults}, "documents": []}, updated_at=utc_dt())
            session.add(row)
            session.flush()
            self.audit(session, row, "WORKFLOW_STARTED", "Banking workflow opened")
            return self.view(row)

    def validate_fields(self, skill_id, fields):
        schema = {f["key"]: f for f in WORKFLOWS[skill_id]["fields"]}
        if set(fields) - set(schema):
            raise HTTPException(422, "Unsupported form fields")
        out = {}
        for key, value in fields.items():
            if not isinstance(value, str) or len(value) > 1200:
                raise HTTPException(422, "Invalid field value")
            value = value.strip()
            f = schema[key]
            if value and f["choices"] and value not in {c[0] for c in f["choices"]}:
                raise HTTPException(422, f"Choose a listed option for {f['label']}")
            if key == "pan_number": value = value.upper()
            if key == "mobile":  # accept +91 98765 43210 / 098765 43210 and store the 10-digit number
                digits = re.sub(r"\D", "", value)
                value = digits[-10:] if len(digits) in (11, 12) and digits[:-10] in ("0", "91") else digits or value
            if key == "document_last4" and value and not re.fullmatch(r"[A-Za-z0-9]{4}", value):
                raise HTTPException(422, "Enter only the last four characters of the document number")
            out[key] = redact(value)
        return out

    def save(self, workflow_id, customer_id, body):
        with self.db._lock, self.db.runtime.sessions.begin() as session:
            row = self.owned(session, workflow_id, customer_id, True)
            self.editable(row, body.revision)
            fields = self.validate_fields(row.skill_id, body.fields)
            p = copy.deepcopy(row.payload)
            p["fields"].update(fields)
            p["sources"].update({key:"CUSTOMER_CONFIRMED" for key in fields})
            p.pop("review_digest", None)
            row.payload, row.revision, row.updated_at = p, row.revision + 1, utc_dt()
            return self.view(row)

    def checks(self, row):
        f = row.payload.get("fields", {})
        schema = WORKFLOWS[row.skill_id]
        checks = []
        def add(code, ok, message, blocking=True):
            checks.append({"code":code, "status":"PASS" if ok else ("ACTION_REQUIRED" if blocking else "OFFICER_REVIEW"), "message":message, "blocking":not ok and blocking})
        no_change = row.skill_id == "kyc" and f.get("update_type") == "NO_CHANGE"
        existing_identity = {"date_of_birth", "pan_route", "identity_document"} if no_change else set()
        missing = [s["label"] for s in schema["fields"] if s["required"] and s["key"] not in existing_identity and not f.get(s["key"])]
        add("REQUIRED_FIELDS", not missing, "Required details completed" if not missing else "Complete: " + ", ".join(missing))
        for s in schema["fields"]:
            v = f.get(s["key"], "")
            if v and s.get("pattern"):
                add("FORMAT_" + s["key"].upper(), bool(re.fullmatch(s["pattern"], v)), s["label"] + " format")
            if v and s["kind"] == "date":
                try: date.fromisoformat(v)
                except ValueError: add("INVALID_DATE", False, "Enter a valid " + s["label"].lower())
        if f.get("account_id"):
            acc = self.db.get_account(f["account_id"])
            add("ACCOUNT_OWNERSHIP", bool(acc and acc["customer_id"] == row.customer_id and acc["status"] == "ACTIVE"), "Active account belongs to you")
        if f.get("beneficiary_id"):
            b = self.db.snapshot()["beneficiaries"].get(f["beneficiary_id"], {})
            add("PAYEE_ELIGIBILITY", b.get("customer_id") == row.customer_id and not (b.get("is_mule") or "BLOCK" in b.get("status", "") or b.get("risk_level") == "HIGH"), "Payee belongs to your directory and is eligible")
        if f.get("amount"):
            add("EXACT_INR_AMOUNT", bool(re.fullmatch(r"[0-9]+(?:\.[0-9]{1,2})?", f["amount"])) and Decimal(f["amount"] if re.fullmatch(r"[0-9]+(?:\.[0-9]{1,2})?", f["amount"]) else "0") > 0, "Amount is positive INR with at most two decimal places")
        try:
            if f.get("start") and f.get("end"):
                start, end = date.fromisoformat(f["start"]), date.fromisoformat(f["end"])
                add("DATE_RANGE", start <= end and (end-start).days <= (366 if row.skill_id == "statement" else 3660), "Valid date range")
                add("DATE_BOUNDARY", end <= date.today() if row.skill_id == "statement" else start >= date.today(), "Statement dates are in the past" if row.skill_id == "statement" else "First payment is today or later")
            if f.get("appointment_date"):
                day = date.fromisoformat(f["appointment_date"])
                add("APPOINTMENT_DATE", date.today() <= day <= date.today()+timedelta(days=90) and day.weekday() != 6, "Choose a non-Sunday date within the next 90 days")
            if f.get("nominee_dob"):
                born = date.fromisoformat(f["nominee_dob"])
                add("NOMINEE_DOB", born <= date.today(), "Nominee date of birth is not in the future")
                add("MINOR_GUARDIAN", (date.today()-born).days >= 18*365.25 or bool(f.get("guardian_name")), "A minor nominee requires a guardian")
        except ValueError: pass
        docs = row.payload.get("documents", [])
        if schema["documents"]:
            no_change = row.skill_id == "kyc" and f.get("update_type") == "NO_CHANGE"
            prior = self.db.get_kyc_profile(row.customer_id)
            add("DOCUMENT_EVIDENCE", bool(docs) or no_change, "Supporting evidence uploaded, or eligible no-change re-KYC selected")
            if no_change:
                add("RE_KYC_ELIGIBILITY", prior.get("status") not in {"NOT_DONE", "EXPIRED"} and prior.get("kyc_type") != "INITIAL_KYC", "No-change route is for previously verified customers")
                for key in ("address", "occupation", "annual_income_slab"):
                    if prior.get(key): add("NO_CHANGE_"+key.upper(), f.get(key) == prior[key], "No-change declaration matches registered " + key.replace("_", " "))
            else:
                add("ADDRESS_EVIDENCE", any(d["document_type"] == f.get("identity_document") for d in docs), "Selected identity/address document is attached")
            if row.skill_id == "kyc":
                if no_change:
                    add("EXISTING_IDENTITY_RECORD", prior.get("pan_masked") not in {None, "UNVERIFIED", "••••••••••"}, "Bank has a prior identity record for no-change re-KYC")
                elif f.get("pan_route") == "PAN":
                    add("PAN_FORMAT", bool(re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]", f.get("pan_number", ""))), "PAN has the expected format; issuer verification is separate")
                    add("PAN_EVIDENCE", no_change or any(d["document_type"] == "PAN" for d in docs), "PAN evidence attached")
                elif f.get("pan_route") == "FORM_60":
                    add("FORM_60_EVIDENCE", bool(f.get("form60_reason")) and any(d["document_type"] == "FORM_60" for d in docs), "Attach completed Form 60 and its reason")
                add("TAX_RESIDENCY_DETAILS", f.get("tax_residency") not in {"MULTIPLE_COUNTRIES", "OUTSIDE_INDIA"} or bool(f.get("foreign_tax_details")), "Foreign tax residency requires supporting tax details")
                add("PEP_DETAILS", f.get("pep_status") != "YES" or bool(f.get("pep_details")), "Provide PEP role / relationship if applicable")
                if f.get("pep_status") == "YES" or f.get("us_person") == "YES" or f.get("tax_residency") in {"MULTIPLE_COUNTRIES", "OUTSIDE_INDIA"}:
                    add("ENHANCED_DUE_DILIGENCE", False, "Specialist review for PEP / cross-border tax declarations", False)
                try:
                    if f.get("date_of_birth"): add("DATE_OF_BIRTH", date(1900,1,1) <= date.fromisoformat(f["date_of_birth"]) <= date.today(), "Valid date of birth")
                    if not no_change and f.get("identity_document") in {"PASSPORT","DRIVING_LICENSE"}:
                        add("OVD_VALIDITY", bool(f.get("document_expiry")) and date.fromisoformat(f["document_expiry"]) >= date.today(), "Passport / driving licence must be unexpired")
                except ValueError: pass
            for doc in docs:
                add("OCR_"+doc["id"], doc.get("scan_status") == "TEXT_EXTRACTED", "Document reading: " + doc["document_type"], False)
                for key in ("full_name", "date_of_birth", "pan_number"):
                    value = doc.get("extracted_fields", {}).get(key)
                    if value and f.get(key):
                        norm = lambda v: re.sub(r"[^a-z0-9]", "", v.lower())
                        add("DOCUMENT_"+key.upper()+"_MATCH", norm(value) == norm(f[key]), "Compare " + key.replace("_", " ") + " with " + doc["document_type"], False)
                if doc.get("quality_score") is not None:
                    add("DOCUMENT_READABILITY", doc["quality_score"] >= 0.7, "Document readability / OCR confidence", False)
            add("ISSUER_AUTHENTICITY", False, "PAN issuer and OVD authenticity must be independently verified by the bank", False)
            if row.skill_id == "kyc":
                add("IDENTITY_AND_SCREENING", False, "Bank must complete identity, sanctions / PEP screening and any required V-CIP. A photo is not liveness proof", False)
        return checks

    def upload(self, workflow_id, customer_id, body):
        if not body.consent:
            raise HTTPException(422, "Permission to process this document is required")
        if body.document_type not in DOCUMENT_TYPES:
            raise HTTPException(422, "Unsupported document type")
        with self.db.runtime.sessions() as session:
            row = self.owned(session, workflow_id, customer_id)
            self.editable(row, body.revision)
            if not WORKFLOWS[row.skill_id]["documents"]:
                raise HTTPException(422, "This service does not collect documents")
        try: raw, mime, pages = validate_file(body.data_base64, body.mime_type)
        except ValueError as exc: raise HTTPException(422, str(exc)) from exc
        sha = hashlib.sha256(raw).hexdigest()
        with self.db.runtime.sessions() as session:
            row = self.owned(session, workflow_id, customer_id)
            if any(d["sha256"] == sha and d["document_type"] == body.document_type for d in row.payload.get("documents", [])):
                return self.view(row)
        try:
            scan = self.scanner.scan(raw, mime, pages)
        except Exception as exc:
            # No raw cloud errors, credentials or document contents enter the response.
            scan = {"status":"SCAN_UNAVAILABLE", "text":"", "provider":self.scanner.configuration()["provider"], "quality_score":None,
                    "error_code":type(exc).__name__, "message":"Document saved. Cloud scanning is unavailable; retry scanning or enter the details for officer review."}
        fields = basic_fields(scan.get("text", ""), body.document_type)
        with self.db._lock, self.db.runtime.sessions.begin() as session:
            row = self.owned(session, workflow_id, customer_id, True)
            self.editable(row, body.revision)
            p = copy.deepcopy(row.payload)
            if len(p["documents"]) >= 6: raise HTTPException(422, "A workflow supports up to six documents")
            doc = {"id":new_id("DOC"), "document_type":body.document_type, "mime_type":mime, "pages":pages,
                "sha256":sha, "size_bytes":len(raw), "name":body.document_type+ (".pdf" if mime == "application/pdf" else ".jpg"),
                "encrypted_content":cipher().encrypt(raw).decode(), "scan_status":scan["status"], "provider":scan["provider"],
                "quality_score":scan.get("quality_score"), "text":scan.get("text", ""), "extracted_fields":fields,
                "authenticity":"NOT_VERIFIED", "consented_at":utc_dt().isoformat(), "message":scan.get("message", "Review extracted information before continuing")}
            # OCR text is encrypted too; only redacted text is supplied to the single agent.
            doc["text"] = cipher().encrypt(doc["text"].encode()).decode()
            p["documents"].append(doc)
            for key, value in fields.items():
                if not p["fields"].get(key):
                    p["fields"][key], p["sources"][key] = value, "DOCUMENT_OCR"
            p.pop("review_digest", None)
            row.payload, row.revision, row.updated_at = p, row.revision+1, utc_dt()
            self.audit(session, row, "DOCUMENT_CAPTURED", "Supporting document stored; issuer verification remains pending")
            return self.view(row)

    def extract(self, workflow_id, customer_id, document_id, fields):
        with self.db._lock, self.db.runtime.sessions.begin() as session:
            row = self.owned(session, workflow_id, customer_id, True)
            self.editable(row)
            allowed = {"full_name","date_of_birth","pan_number","address","city","state","pincode","document_last4","document_expiry"}
            if set(fields) - allowed: raise HTTPException(422, "Only document facts can be extracted")
            valid = self.validate_fields(row.skill_id, fields)
            p = copy.deepcopy(row.payload)
            doc = next((d for d in p["documents"] if d["id"] == document_id), None)
            if not doc: raise HTTPException(404, "Document not found")
            doc["extracted_fields"].update(valid)
            doc["extraction_source"] = "ANTIGRAVITY_DOCUMENT_INTERPRETATION"
            for key, value in valid.items():
                if p["sources"].get(key) != "CUSTOMER_CONFIRMED" and value:
                    p["fields"][key], p["sources"][key] = value, "DOCUMENT_AI_SUGGESTION"
            p.pop("review_digest", None)
            row.payload, row.revision, row.updated_at = p, row.revision+1, utc_dt()
            self.audit(session, row, "DOCUMENT_FIELDS_SUGGESTED", "Agent suggested document fields for customer review")
            return self.view(row)

    def agent_context(self, workflow_id, customer_id):
        with self.db.runtime.sessions() as session:
            row = self.owned(session, workflow_id, customer_id)
            return [{"document_id":d["id"], "document_type":d["document_type"], "untrusted_ocr_text":cipher().decrypt(d["text"].encode()).decode()}
                    for d in row.payload.get("documents", [])]

    def get_skill_for_workflow(self, workflow_id, customer_id) -> str:
        with self.db.runtime.sessions() as session:
            row = self.owned(session, workflow_id, customer_id)
            return row.skill_id

    def review(self, workflow_id, customer_id, revision):
        with self.db._lock, self.db.runtime.sessions.begin() as session:
            row = self.owned(session, workflow_id, customer_id, True)
            self.editable(row, revision)
            checks = self.checks(row)
            if any(c["blocking"] for c in checks):
                raise HTTPException(422, {"message":"Complete the highlighted checks before review", "checks":checks})
            p = copy.deepcopy(row.payload)
            p["review_digest"] = digest({"id":row.id, "revision":row.revision, "fields":p["fields"], "documents":[d["sha256"] for d in p["documents"]]})
            p["review_expires_at"] = (utc_dt()+timedelta(minutes=10)).isoformat()
            row.payload = p
            return self.view(row)

    def submit(self, workflow_id, context, body, consent_id):
        with self.db._lock, self.db.runtime.sessions.begin() as session:
            row = self.owned(session, workflow_id, context.customer_id, True)
            if not body.confirmed or body.review_digest != row.payload.get("review_digest") or body.revision != row.revision:
                raise HTTPException(409, "Review the current details and explicitly confirm them")
            if row.status in {"SUBMITTED", "COMPLETED"}: return self.view(row)
            self.editable(row)
            if row.payload.get("review_expires_at", "") < utc_dt().isoformat(): raise HTTPException(409, "Review expired. Please review again")
            spec = WORKFLOWS[row.skill_id]
            if spec["level"] == "L3" and context.assurance_level != "L3":
                raise HTTPException(403, {"code":"STEP_UP_REQUIRED", "message":"Verify your identity before submitting"})
            checks = self.checks(row)
            if any(c["blocking"] for c in checks): raise HTTPException(409, "Banking details have changed. Review the form again")
            p = copy.deepcopy(row.payload)
            f = copy.deepcopy(p["fields"])
            if row.skill_id == "statement":
                p["download"] = "/api/portal/statement.csv?" + urlencode({k:f[k] for k in ("account_id","start","end")})
                row.status = "COMPLETED"
            else:
                service_id = spec["service_id"]
                if row.skill_id == "deposit" and f["deposit_type"] == "RECURRING": service_id = "P1-20"
                if row.skill_id == "certificate" and f["certificate_type"] == "INTEREST": service_id = "P1-22"
                if "pan_number" in f:
                    raw_pan = f["pan_number"]
                    f["pan_masked"] = "••••••" + raw_pan[-4:]
                    if service_id != "P1-25":
                        f.pop("pan_number")
                if "amount" in f: f["amount_minor"] = int(Decimal(f.pop("amount")) * 100)
                f.update(workflow_id=row.id, policy_version=POLICY_VERSION, consent_id=consent_id,
                    submission_channel="KOSH_MITRA_WORKFLOW", document_ids=[d["id"] for d in p["documents"]], review_digest=body.review_digest)
                request_id = row.request_id or new_id("REQ")
                request = session.scalar(select(ServiceRequestRecord).where(ServiceRequestRecord.id == request_id).with_for_update()) if row.request_id else None
                if request:
                    if request.customer_id != row.customer_id or request.status != "MORE_INFO_REQUIRED":
                        raise HTTPException(409, "This request cannot be resubmitted")
                    request.status, request.collected_data, request.findings = "PENDING_APPROVAL", f, checks
                    request.discrepancy_flags = [c["code"] for c in checks if c["status"] == "OFFICER_REVIEW"]
                    request.updated_at, request.resolution_reason, request.approver_id = utc_dt(), None, None
                else:
                    request = ServiceRequestRecord(id=request_id, customer_id=row.customer_id, session_id=context.session_id,
                        service_id=service_id, status="PENDING_APPROVAL", auth_level=spec["level"], collected_data=f,
                        findings=checks, discrepancy_flags=[c["code"] for c in checks if c["status"] == "OFFICER_REVIEW"], confidence_scores={})
                    session.add(request)
                if row.skill_id == "kyc":
                    bank = session.scalar(select(BankingStateRecord).where(BankingStateRecord.id==1).with_for_update())
                    state = copy.deepcopy(bank.payload)
                    customer = state.get("customers", {}).get(row.customer_id) or state.get("customer")
                    profile = customer.setdefault("kyc", {})
                    if profile.get("pending_request_id") not in {None, request_id}: raise HTTPException(409, "A KYC request is already awaiting review")
                    profile.update(status="SUBMITTED_FOR_REVIEW", pending_request_id=request_id)
                    bank.payload, bank.version = state, bank.version+1
                row.request_id, row.status = request_id, "SUBMITTED"
            row.payload, row.updated_at = p, utc_dt()
            self.audit(session, row, "WORKFLOW_SUBMITTED", "Customer reviewed and submitted banking workflow")
            view = self.view(row)
            stp = (row.id, request_id, row.skill_id, row.customer_id, f) if row.skill_id in STP_SKILLS else None
        # Straight-through processing runs after the submission is committed (its ledger change is its own transaction).
        return self.straight_through(*stp) if stp else view

    def straight_through(self, workflow_id, request_id, skill_id, customer_id, fields):
        from backend.notifications import notify, phone_for
        fulfilment, referral = stp_fulfil(self.db, skill_id, customer_id, fields, request_id)
        with self.db._lock, self.db.runtime.sessions.begin() as session:
            request = session.get(ServiceRequestRecord, request_id)
            row = session.get(BankingWorkflowRecord, workflow_id)
            data = dict(request.collected_data or {})
            if fulfilment:
                data["fulfilment"] = fulfilment
                request.status, request.resolution_reason, request.approver_id = "COMPLETED", fulfilment["summary"], "STP"
                row.status = "COMPLETED"
                row.payload = {**row.payload, "fulfilment": fulfilment, **({"download": fulfilment["download"]} if fulfilment.get("download") else {})}
                self.audit(session, row, "STP_COMPLETED", f"Straight-through: {fulfilment['summary']}")
            else:
                data["stp_referral"] = referral
                request.discrepancy_flags = list(dict.fromkeys([*(request.discrepancy_flags or []), "STP_REFERRED"]))
                self.audit(session, row, "STP_REFERRED", f"Sent to officer review: {referral}")
            request.collected_data, request.updated_at, row.updated_at = data, utc_dt(), utc_dt()
            view = self.view(row)
        if fulfilment:
            notify(self.db, "service_request_update", phone_for(self.db, customer_id), customer_id=customer_id,
                   reference=request_id, service=WORKFLOWS[skill_id]["name"], status="completed")
        return view


def make_workflow_router(service, customer, customer_csrf, consent, officer, limiter):
    router = APIRouter(prefix="/api/ai")
    @router.get("/services")
    def services(context=Depends(customer)):
        return {"services":catalogue(), "document_processing":service.scanner.configuration()}

    @router.get("/workflows")
    def list_workflows(context=Depends(customer)):
        with service.db.runtime.sessions() as session:
            rows=session.scalars(select(BankingWorkflowRecord).where(BankingWorkflowRecord.customer_id==context.customer_id).order_by(BankingWorkflowRecord.updated_at.desc()).limit(30))
            return {"workflows":[service.view(r) for r in rows]}

    @router.post("/workflows")
    def start(body:StartBody, context=Depends(customer_csrf)):
        consent(context)
        return service.start(context.customer_id, context.user_id, body.skill_id)

    @router.get("/workflows/{workflow_id}")
    def get(workflow_id:str, context=Depends(customer)):
        with service.db.runtime.sessions() as session:
            return service.view(service.owned(session,workflow_id,context.customer_id))

    @router.patch("/workflows/{workflow_id}")
    def save(workflow_id:str, body:SaveBody, context=Depends(customer_csrf)):
        consent(context)
        return service.save(workflow_id,context.customer_id,body)

    @router.post("/workflows/{workflow_id}/documents")
    @limiter.limit("10/minute")
    def upload(workflow_id:str, body:UploadBody, request:Request, response:Response, context=Depends(customer_csrf)):
        consent(context)
        return service.upload(workflow_id,context.customer_id,body)

    @router.delete("/workflows/{workflow_id}/documents/{document_id}")
    def delete_document(workflow_id:str, document_id:str, context=Depends(customer_csrf)):
        consent(context)
        with service.db._lock, service.db.runtime.sessions.begin() as session:
            row=service.owned(session,workflow_id,context.customer_id,True)
            service.editable(row)
            p=copy.deepcopy(row.payload)
            p["documents"]=[d for d in p["documents"] if d["id"] != document_id]
            for key in list(p["sources"]):
                if p["sources"][key].startswith("DOCUMENT"):
                    p["fields"].pop(key,None); p["sources"].pop(key,None)
            p.pop("review_digest",None)
            row.payload,row.revision=p,row.revision+1
            service.audit(session,row,"WORKFLOW_DOCUMENT_REMOVED","Supporting document removed from draft")
            return service.view(row)

    @router.post("/workflows/{workflow_id}/review")
    def review(workflow_id:str, body:SaveBody, context=Depends(customer_csrf)):
        consent(context)
        return service.review(workflow_id,context.customer_id,body.revision)

    @router.post("/workflows/{workflow_id}/submit")
    def submit(workflow_id:str, body:SubmitBody, context=Depends(customer_csrf)):
        grant=consent(context)
        return service.submit(workflow_id,context,body,grant["id"])

    @router.post("/workflows/{workflow_id}/reopen")
    def reopen(workflow_id:str, context=Depends(customer_csrf)):
        consent(context)
        with service.db._lock, service.db.runtime.sessions.begin() as session:
            row=service.owned(session,workflow_id,context.customer_id,True)
            request=session.get(ServiceRequestRecord,row.request_id) if row.request_id else None
            if not request or request.status != "MORE_INFO_REQUIRED":
                raise HTTPException(409,"The bank has not requested additional information for this workflow")
            if row.status == "DRAFT": return service.view(row)
            p=copy.deepcopy(row.payload)
            p.setdefault("previous_submissions",[]).append({"revision":row.revision,"fields":copy.deepcopy(p["fields"]),"documents":copy.deepcopy(p["documents"])})
            p.pop("review_digest",None)
            row.payload,row.status,row.revision=p,"DRAFT",row.revision+1
            service.audit(session,row,"WORKFLOW_REOPENED","Customer reopened form to provide information requested by the bank")
            return service.view(row)

    @router.get("/officer/workflows/{workflow_id}/documents/{document_id}")
    def officer_document(workflow_id:str, document_id:str, context=Depends(officer)):
        with service.db.runtime.sessions() as session:
            row=session.get(BankingWorkflowRecord,workflow_id)
            if not row or not row.request_id: raise HTTPException(404,"Evidence not found")
            doc=next((d for d in row.payload.get("documents",[]) if d["id"]==document_id),None)
            if not doc: raise HTTPException(404,"Evidence not found")
            raw=cipher().decrypt(doc["encrypted_content"].encode())
        service.db.append_audit("OFFICER_EVIDENCE_VIEWED", actor="officer", approver_id=context.user_id,
            approval_request_id=row.request_id, summary="Officer opened supporting evidence")
        return Response(raw,media_type=doc["mime_type"],headers={"Cache-Control":"no-store", "Content-Disposition":'attachment; filename="'+doc["name"]+'"'})
    return router
