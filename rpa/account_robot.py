"""The account-opening robot: keys an approved application into the legacy core's screens, then authorises it as the
core's checker, and reads back what the core created. The core has no API; this is the only way in.

    sign in as RPA-MAKER ─▶ enquiry by reference ─┬─ nothing yet ─▶ new customer (CIF, new to bank) ─▶ account / deposit
                                                  ├─ pending ─────▶ (a previous run keyed it: skip to the checker)
                                                  └─ active ──────▶ (already authorised: just read the numbers back)
    sign out ─▶ sign in as RPA-CHECKER ─▶ authorise the reference ─▶ read CIF, account or deposit number, checker ref

Before every save the robot reads each field back from the screen and compares it with what it meant to type. A refusal
shown by the core (duplicate PAN, wrong funding account) is reported as such, not retried.
"""

from __future__ import annotations

import base64
import os
from datetime import datetime
from typing import Any, Callable, Optional

from playwright.async_api import Page, async_playwright

from rpa.sanitizer import sanitize_field
from rpa.verifier import verify_dom_read_back

Progress = Callable[[dict[str, Any]], None]
SCHEME = {"PROD-SAV-PREMIER": "SB_GEN_IND", "PROD-SAV-DIGITAL": "SB_GEN_IND"}
MATURITY = {"RENEW_PRINCIPAL_INTEREST", "RENEW_PRINCIPAL", "CLOSE_AND_CREDIT"}


class CoreRefused(Exception):
    """The legacy core refused the entry (shown in its error banner). An officer decides; the robot does not retry."""


def _operator(role: str) -> tuple[str, str]:
    production = os.getenv("ENVIRONMENT", "").lower() in {"production", "prod"}
    variable, default = {"MAKER": ("LEGACY_CBS_MAKER_PASSWORD", "maker-demo"),
                         "CHECKER": ("LEGACY_CBS_CHECKER_PASSWORD", "checker-demo")}[role]
    password = os.getenv(variable) or (None if production else default)
    if not password:
        raise RuntimeError(f"{variable} must be set in production")
    return f"RPA-{role}", password


def legacy_fields(payload: dict[str, Any]) -> dict[str, str]:
    """The applicant's form as the legacy new-customer screen takes it (upper case, DD/MM/YYYY), checked field by field."""
    dob = datetime.strptime(str(payload["date_of_birth"]), "%Y-%m-%d").strftime("%d/%m/%Y")
    mobile = str(payload["mobile"])[-10:]
    return {"txtCustName": sanitize_field(str(payload["full_name"]), "name"),
            "txtPanNo": sanitize_field(str(payload["pan_number"]).upper(), "pan"),
            "txtDob": dob, "txtMobile": sanitize_field(mobile, "mobile"), "txtEmail": str(payload["email"]).strip().lower(),
            "txtAddress": sanitize_field(str(payload["address"]), "address").upper(),
            "txtCity": sanitize_field(str(payload["city"]), "name"), "txtPin": sanitize_field(str(payload["pincode"]), "pincode")}


class AccountRobot:
    def __init__(self, base_url: str, *, headless: Optional[bool] = None, typing_delay_ms: Optional[int] = None,
                 step_delay_ms: Optional[int] = None, progress: Optional[Progress] = None):
        self.base_url = base_url.rstrip("/")
        self.headless = os.getenv("RPA_HEADLESS", "true").lower() in {"1", "true", "yes", "on"} if headless is None else headless
        self.typing_delay_ms = (0 if self.headless else 25) if typing_delay_ms is None else typing_delay_ms
        default_step_delay = 550 if os.getenv("K_SERVICE") else 0
        self.step_delay_ms = int(os.getenv("RPA_STEP_DELAY_MS", str(default_step_delay))) if step_delay_ms is None else step_delay_ms
        self.progress = progress or (lambda event: None)
        self.page: Optional[Page] = None

    async def run(self, application: dict[str, Any], context: dict[str, Any],
                  on_maker_saved: Callable[[str, str], None]) -> dict[str, Any]:
        """Open what `application` asks for. `context`: the customer's CIF (existing customer) and, for an FD, the funding
        account's core number. Calls on_maker_saved(maker_reference, cif) once the core holds the maker entry."""
        ref, kind = application["reference"], application["kind"]
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=self.headless)
            try:
                self.page = await (await browser.new_context(viewport={"width": 1100, "height": 760})).new_page()
                await self._sign_in("MAKER")
                found = await self._enquire(ref)
                if any(row["status"] == "ACTIVE" for row in found):  # authorised by an earlier run that stopped afterwards
                    await self._step("ENQUIRY", "Already authorised in the core: reading the numbers back")
                    return self._authorised_from(found, checker_reference="(earlier run)")
                product = next((row for row in found if row["kind"] in ("ACCOUNT", "DEPOSIT")), None)
                if product:
                    await self._step("ENQUIRY", "Maker entry already in the core from an earlier run: going to the checker")
                    on_maker_saved(product["number"], product["cif"])
                else:  # nothing yet, or only the new customer an earlier run created before it stopped
                    pending_cif = next((row["cif"] for row in found if row["kind"] == "CUSTOMER"), None)
                    cif = context.get("cif") or pending_cif or await self._new_customer(application["payload"], ref)
                    number = await (self._new_deposit(cif, application["payload"], context, ref) if kind == "FD"
                                    else self._new_account(cif, application, ref))
                    on_maker_saved(number, cif)
                await self._sign_out()
                await self._sign_in("CHECKER")
                return await self._authorise(ref)
            finally:
                await browser.close()

    # ---- screens ---------------------------------------------------------------------------------------------
    async def _sign_in(self, role: str) -> None:
        step_id = f"SIGN_IN_{role}"
        operator, password = _operator(role)
        await self.page.goto(f"{self.base_url}/login")
        await self._step(step_id, f"Opening operator login for {operator}…", phase="RUNNING")
        await self._type({"txtOperatorId": operator}, step=step_id)
        await self.page.fill("#txtPassword", password)  # never typed slowly or shown in progress events
        await self._step(step_id, f"Submitting credentials for {operator}…", phase="RUNNING")
        await self.page.click("#btnLogin")
        if not await self.page.locator("#mnuMain").count():
            raise RuntimeError(f"Could not sign in to the core as {operator}")
        await self._step(step_id, f"Signed in to the core as {operator}")

    async def _sign_out(self) -> None:
        await self._step("SIGN_OUT", "Signing out of maker session…", phase="RUNNING")
        await self.page.click("#lnkLogout")
        await self._step("SIGN_OUT", "Signed out of the core")

    async def _enquire(self, ref: str) -> list[dict[str, str]]:
        await self.page.goto(f"{self.base_url}/enquiry?ref={ref}")
        await self._step("ENQUIRY", f"Looking up portal reference {ref} in core…", phase="RUNNING")
        rows = await self.page.locator("tr.result-row").evaluate_all(
            "rows => rows.map(r => ({kind: r.dataset.kind, number: r.dataset.number, cif: r.dataset.cif, status: r.dataset.status}))")
        await self._step("ENQUIRY", f"Enquiry for {ref}: {len(rows)} record(s) in the core")
        return rows

    async def _new_customer(self, payload: dict[str, Any], ref: str) -> str:
        await self.page.goto(f"{self.base_url}/customer/new")
        await self._step("NEW_CUSTOMER", "Opened New Customer (CIF) screen in core…", phase="RUNNING")
        fields = {**legacy_fields(payload), "txtExtRef": ref}
        await self._type(fields, step="NEW_CUSTOMER")
        await self._save("#btnSaveCustomer", fields, "NEW_CUSTOMER")
        cif = (await self.page.locator("#lblCifNumber").text_content()).strip()
        await self._step("NEW_CUSTOMER", f"Customer {cif} saved for authorisation")
        return cif

    async def _new_account(self, cif: str, application: dict[str, Any], ref: str) -> str:
        payload = application["payload"]
        await self.page.goto(f"{self.base_url}/account/new?cif={cif}")
        await self._step("NEW_ACCOUNT", f"Opened New Savings Account screen for CIF {cif}…", phase="RUNNING")
        await self.page.select_option("#ddlScheme", SCHEME.get(application["product_id"], "SB_GEN_IND"))
        fields = {"txtExtRef": ref}
        if payload.get("nominee_name"):
            fields["txtNominee"] = sanitize_field(str(payload["nominee_name"]), "name")
            await self.page.select_option("#ddlNomineeRel", str(payload.get("nominee_relationship") or "OTHER").upper())
        await self._type(fields, step="NEW_ACCOUNT")
        await self._save("#btnSaveAccount", {**fields, "txtCif": cif}, "NEW_ACCOUNT")
        number = (await self.page.locator("#lblAcctNumber").text_content()).strip()
        await self._step("NEW_ACCOUNT", f"Savings account {number} saved for authorisation")
        return number

    async def _new_deposit(self, cif: str, payload: dict[str, Any], context: dict[str, Any], ref: str) -> str:
        amount = int(payload["amount_minor"])
        maturity = str(payload.get("maturity_instruction") or "RENEW_PRINCIPAL_INTEREST")
        if maturity not in MATURITY:
            raise ValueError(f"Unknown maturity instruction {maturity}")
        await self.page.goto(f"{self.base_url}/deposit/new?cif={cif}")
        await self._step("NEW_DEPOSIT", f"Opened Fixed Deposit screen for CIF {cif}…", phase="RUNNING")
        await self.page.select_option("#ddlMaturity", maturity)
        fields = {"txtFundingAcct": str(context["funding_account"]), "txtAmount": f"{amount // 100}.{amount % 100:02d}",
                  "txtTenure": str(int(payload["tenure_months"])), "txtExtRef": ref}
        await self._type(fields, step="NEW_DEPOSIT")
        await self._save("#btnSaveDeposit", {**fields, "txtCif": cif}, "NEW_DEPOSIT")
        number = (await self.page.locator("#lblFdNumber").text_content()).strip()
        await self._step("NEW_DEPOSIT", f"Fixed deposit {number} saved for authorisation")
        return number

    async def _authorise(self, ref: str) -> dict[str, Any]:
        await self.page.goto(f"{self.base_url}/authorise?ref={ref}")
        await self._step("AUTHORISE", f"Checker reviewing pending entry {ref}…", phase="RUNNING")
        await self._type({"txtExtRef": ref}, step="AUTHORISE")
        await self.page.click("#btnAuthorise")
        await self._refused("AUTHORISE")
        checker_reference = await self._text("#lblCheckerRef")
        if not checker_reference:
            raise RuntimeError("The core's authorisation screen showed no authorisation reference")
        found = await self._enquire(ref)  # read every number back from the core itself, not from what was typed
        result = self._authorised_from(found, checker_reference=checker_reference)
        await self._step("AUTHORISE", f"Authorised by the core's checker ({result['checker_reference']})")
        return result

    # ---- helpers ---------------------------------------------------------------------------------------------
    async def _type(self, fields: dict[str, str], step: Optional[str] = None) -> None:
        field_names = {
            "txtOperatorId": "Operator ID",
            "txtCustName": "Customer Name",
            "txtPanNo": "PAN Number",
            "txtDob": "Date of Birth",
            "txtMobile": "Mobile Number",
            "txtEmail": "Email Address",
            "txtAddress": "Residential Address",
            "txtCity": "City",
            "txtPin": "PIN Code",
            "txtExtRef": "Portal Reference",
            "txtNominee": "Nominee Name",
            "txtFundingAcct": "Funding Account",
            "txtAmount": "Deposit Amount",
            "txtTenure": "Tenure (Months)",
        }
        for element, value in fields.items():
            box = self.page.locator(f"#{element}")
            await box.click()
            await box.fill("")
            if self.typing_delay_ms:
                await box.type(value, delay=self.typing_delay_ms)
            else:
                await box.fill(value)
            if step and self.step_delay_ms:
                friendly = field_names.get(element, element)
                await self._step(step, f"Keying {friendly}: {value}", phase="RUNNING", delay_divisor=2)

    async def _save(self, button: str, expected: dict[str, str], step: str) -> None:
        await verify_dom_read_back(self.page, expected)  # what is on screen is exactly what the bank approved
        await self._step(step, "Every field read back from the screen matches the approved application")
        await self.page.click(button)
        await self._refused(step)

    async def _refused(self, step: str) -> None:
        banner = await self._text("#errorBanner")
        if banner:
            await self._step(step, f"The core refused: {banner}", phase="FAILED")
            raise CoreRefused(banner)

    async def _text(self, selector: str) -> Optional[str]:
        locator = self.page.locator(selector)
        return (await locator.text_content()).strip() if await locator.count() else None

    def _authorised_from(self, rows: list[dict[str, str]], checker_reference: str) -> dict[str, Any]:
        if not rows or any(row["status"] != "ACTIVE" for row in rows):
            raise RuntimeError("The core did not show every record for this reference as authorised")
        account = next((row["number"] for row in rows if row["kind"] == "ACCOUNT"), None)
        deposit = next((row["number"] for row in rows if row["kind"] == "DEPOSIT"), None)
        return {"cif_number": rows[0]["cif"], "account_number": account, "fd_number": deposit, "checker_reference": checker_reference}

    async def _step(self, step: str, label: str, phase: str = "COMPLETED", delay_divisor: int = 1) -> None:
        shot = None
        try:
            shot = "data:image/jpeg;base64," + base64.b64encode(await self.page.screenshot(type="jpeg", quality=70)).decode()
        except Exception:
            pass
        self.progress({"step": step, "phase": phase, "label": label, "screenshot": shot})
        if self.step_delay_ms > 0:
            await self.page.wait_for_timeout(max(120, self.step_delay_ms // delay_divisor))
