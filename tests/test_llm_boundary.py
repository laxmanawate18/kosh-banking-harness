"""The LLM boundary: a model reads only declared fields, never identifiers or figures; the customer still sees everything."""
import hashlib
import inspect
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from google.antigravity import types

import dev_ui
from backend import harness
from backend.agent_config import PublicSalesToolGateHook, create_agent_config
from backend.llm_boundary import Vault, guarded_tools, known_identifiers
from banking_db import customer_token
from banking_tools import build_banking_tools

# Keys that must never appear in anything a model reads, whatever the tool.
RESTRICTED_KEYS = {"account_number", "cif_number", "customer_id", "registered_address", "annual_income_slab", "is_pep",
                   "risk_category", "risk_tier", "customer_name", "collected_data", "untrusted_ocr_text", "text"}


def _walk(value, path=""):
    if isinstance(value, dict):
        for k, v in value.items():
            yield from _walk(v, f"{path}.{k}")
    elif isinstance(value, list):
        for v in value:
            yield from _walk(v, f"{path}[]")
    else:
        yield path, value


class BoundaryTests(unittest.TestCase):
    def setUp(self):
        dev_ui.limiter.reset()
        dev_ui.db.reset_to_seed()
        self.context = {"customer_id": "CUST-1001", "session_id": "boundary-test", "user_id": "USR-AARAV", "device_id": "dev",
                        "intent": {"id": "i1", "action_family": "GENERAL", "fields": {}}, "scopes": ["banking.read", "banking.propose"]}
        self.vault = Vault(known_identifiers(dev_ui.db, "CUST-1001"))
        self.tools = {t.__name__: t for t in guarded_tools(build_banking_tools(lambda: self.context), "customer", self.vault)}

    def assert_model_safe(self, view):
        for path, value in _walk(view):
            key = path.rsplit(".", 1)[-1].rstrip("[]")
            self.assertNotIn(key, RESTRICTED_KEYS, path)
            if key.endswith("_minor"):  # every figure reaches the model as a placeholder
                self.assertRegex(str(value), r"^\{\{amt_\d+\}\}$", path)

    def test_every_tool_in_every_channel_declares_what_a_model_may_read(self):
        missing = [(c, n) for c, ch in harness.registry()["channels"].items() for n, s in ch.items() if "model_view" not in s]
        self.assertEqual(missing, [])

    def test_read_tools_give_the_model_placeholders_and_the_screen_the_full_result(self):
        view = self.tools["get_customer_summary"]()
        self.assert_model_safe(view)
        self.assertNotIn("display_name", view["customer"])  # payee names stay (to resolve "send to Riya"), the customer's own does not
        salary = next(a for a in view["accounts"] if a["id"] == "ACC-SAL-001")
        self.assertEqual(salary["account_number_masked"], "•••• 4821")
        self.assertRegex(self.vault.fill(salary["available_balance_minor"]), r"^₹[\d,]+\.\d\d$")
        full = self.vault.screen(view)
        self.assertIsInstance(next(a for a in full["accounts"] if a["id"] == "ACC-SAL-001")["available_balance_minor"], int)
        for name in ("get_transaction_history", "get_security_alerts", "get_kyc_status", "get_lead_reengagement_offer",
                     "check_account_opening_status", "get_outstanding_bills"):
            self.assert_model_safe(self.tools[name]())

    def test_transactions_say_debit_or_credit_because_the_sign_is_hidden(self):
        view = self.tools["get_transaction_history"](limit=5)
        self.assertTrue(view["transactions"])
        self.assertTrue(all(t["direction"] in {"DEBIT", "CREDIT"} for t in view["transactions"]))

    def test_money_questions_are_answered_by_server_side_arithmetic(self):
        balance = dev_ui.db.get_account("ACC-SAL-001")["available_balance_minor"]
        yes = self.tools["check_funds"](amount_minor=balance, account_id="ACC-SAL-001")
        no = self.tools["check_funds"](amount_minor=balance + 1, account_id="ACC-SAL-001")
        self.assertEqual((yes["covers"], no["covers"]), (True, False))
        self.assertEqual(self.vault.fill(no["shortfall_minor"]), "₹0.01")
        spending = self.tools["summarise_spending"](days=365)
        self.assert_model_safe(spending)
        self.assertGreater(spending["count"], 0)

    def test_kyc_view_has_status_but_no_address_income_or_risk(self):
        view = self.tools["get_kyc_status"]()
        self.assertIn("kyc_status", view)
        self.assertFalse({"registered_address", "annual_income_slab", "is_pep", "risk_category"} & set(view))

    def test_typed_identifiers_become_tags_and_tools_get_the_real_value(self):
        text = self.vault.redact("My PAN is ABCDE1234F, mobile 9820515974, email aarav@example.com, OTP is 482913")
        for secret in ("ABCDE1234F", "9820515974", "aarav@example.com", "482913"):
            self.assertNotIn(secret, text)
        self.assertIn("[PAN_", text)
        self.assertIn("[CODE]", text)
        pan_tag = next(k for k in self.vault.inputs if k.startswith("[PAN_"))
        self.assertEqual(self.vault.resolve({"doc_number": pan_tag}), {"doc_number": "ABCDE1234F"})
        self.assertNotIn("482913", self.vault.inputs.values())  # one-time codes are dropped, never kept
        self.assertEqual(self.vault.fill(f"PAN {pan_tag} saved"), "PAN •••• 234F saved")
        self.assertEqual(self.vault.redact("ABCDE1234F again"), f"{pan_tag} again")  # the same value keeps its tag

    def test_a_tool_runs_on_the_real_value_behind_a_tag(self):
        tag = self.vault.redact("ABCDE1234F")
        result = self.tools["validate_kyc_document"](doc_type="PAN", doc_number=tag)
        self.assertTrue(result["is_valid"])
        self.assertEqual(result["masked_identifier"], "••••234F")

    def test_the_gate_checks_the_value_behind_a_tag(self):
        tag = self.vault.redact("9820515974")
        call = types.ToolCall(name="check_application_status", args={"reference": "SAV-APP-1", "mobile": tag}, id="1")
        self.assertTrue(PublicSalesToolGateHook("S", self.vault).decide(call).allow)
        self.assertFalse(PublicSalesToolGateHook("S", Vault()).decide(call).allow)  # unknown tag: the format check fails

    def test_the_safety_net_strips_this_customers_identifiers_and_restricted_shapes(self):
        vault = Vault(["1092004821", "aarav@example.com"])
        out = vault.guard("acct 1092004821, mail aarav@example.com, PAN ABCDE1234F, card 4111 1111 1111 1111")
        for secret in ("1092004821", "aarav@example.com", "ABCDE1234F", "4111 1111 1111 1111"):
            self.assertNotIn(secret, out)
        self.assertEqual(len(vault.hits), 4)

    def test_unknown_placeholders_never_leak_a_guess(self):
        self.assertEqual(Vault().fill("Balance {{amt_99}}"), "Balance (see the details shown above)")

    def test_wrapped_tools_keep_the_real_schema(self):
        raw = {t.__name__: t for t in build_banking_tools(lambda: self.context)}["propose_transfer"]
        wrapped = self.tools["propose_transfer"]
        self.assertEqual(inspect.signature(wrapped), inspect.signature(raw))
        self.assertEqual(wrapped.__doc__, raw.__doc__)

    def test_the_system_prompt_has_the_first_name_only(self):
        config = create_agent_config("boundary-test", session_context=dict(self.context))
        self.assertIn("Aarav", config.system_instructions)
        self.assertNotIn("CUST-1001", config.system_instructions)
        self.assertNotIn("Mehta", config.system_instructions)

    def test_documents_reach_the_model_as_field_names_only(self):
        from banking_workflows import WorkflowService
        from persistence import BankingWorkflowRecord
        service = WorkflowService(dev_ui.db)
        workflow = service.start("CUST-1001", "USR-AARAV", "kyc")
        with dev_ui.db.runtime.sessions.begin() as session:
            row = session.get(BankingWorkflowRecord, workflow["id"])
            row.payload = {**row.payload, "documents": [{"id": "DOC-1", "document_type": "PAN", "scan_status": "TEXT_EXTRACTED",
                                                         "text": "secret", "extracted_fields": {"pan_number": "ABCDE1234F"}}]}
        evidence = service.agent_context(workflow["id"], "CUST-1001")
        self.assertEqual(evidence[0]["fields_found"], ["pan_number"])
        self.assertNotIn("ABCDE1234F", json.dumps(evidence))
        self.assertNotIn("secret", json.dumps(evidence))

    def test_the_audit_pseudonym_is_keyed_not_a_plain_hash(self):
        self.assertNotEqual(customer_token("CUST-1001"), hashlib.sha256(b"CUST-1001").hexdigest()[:24])
        self.assertEqual(customer_token("CUST-1001"), customer_token("CUST-1001"))


class ScriptedMitra:
    """Stands in for Gemini: records what it was sent, calls the balance tool, and words its reply with the placeholder."""
    prompts, instructions = [], []

    def __init__(self, config):
        self.config = config
        ScriptedMitra.instructions.append(config.system_instructions)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    async def chat(self, prompt):
        ScriptedMitra.prompts.append(prompt)
        tool = next(t for t in self.config.tools if t.__name__ == "get_customer_summary")
        view = tool()
        salary = next(a for a in view["accounts"] if a["id"] == "ACC-SAL-001")

        async def chunks():
            yield types.ToolCall(name="get_customer_summary", args={}, id="c1", step_index=0)
            yield types.ToolResult(name="get_customer_summary", id="c1", result=view, step_index=0)
            yield types.Text(step_index=0, text=f"Your salary account balance is {salary['available_balance_minor']}.")
        return SimpleNamespace(chunks=chunks(), usage_metadata=None)


class ChatTurnTests(unittest.TestCase):
    def setUp(self):
        dev_ui.limiter.reset()
        dev_ui.db.reset_to_seed()
        ScriptedMitra.prompts, ScriptedMitra.instructions = [], []
        p = patch.object(dev_ui, "Agent", ScriptedMitra)
        p.start()
        self.addCleanup(p.stop)
        self.client = TestClient(dev_ui.app)
        _, cookie, csrf = dev_ui.auth_service.create_direct_session("aarav")
        self.client.cookies.set(dev_ui.COOKIE_NAME, cookie)
        self.h = {"X-CSRF-Token": csrf}

    def test_show_my_balance_end_to_end(self):
        session_id = self.client.post("/api/sessions", headers=self.h, json={"title": "Balance"}).json()["id"]
        with self.client.websocket_connect(f"/ws/chat?session_id={session_id}") as ws:
            ws.receive_json()
            ws.send_json({"type": "prompt", "prompt": "Show my balance. My PAN is ABCDE1234F"})
            events = []
            while not events or events[-1]["type"] not in {"turn_complete", "error"}:
                events.append(ws.receive_json())
        self.assertEqual(events[-1]["type"], "turn_complete", events[-1])
        balance = dev_ui.db.get_account("ACC-SAL-001")["available_balance_minor"]
        from product_service import inr
        shown = "".join(e.get("text", "") for e in events if e["type"] in {"text_delta", "text_replace"})
        self.assertIn(inr(balance / 100, 2), shown)  # the customer sees the real figure
        sent = json.dumps(ScriptedMitra.prompts, ensure_ascii=False) + "".join(ScriptedMitra.instructions)
        self.assertNotIn("ABCDE1234F", sent)  # what the model was sent: no PAN, no customer id, no figure
        self.assertNotIn("CUST-1001", sent)
        self.assertNotIn(inr(balance / 100, 2), sent)
        card = next(e for e in events if e["type"] == "tool_result")["result"]
        self.assertEqual(next(a for a in card["accounts"] if a["id"] == "ACC-SAL-001")["available_balance_minor"], balance)
        saved = dev_ui.db.get_conversation(session_id)["messages"][-1]
        self.assertIn("{{amt_", saved["model_text"])  # the only form ever fed back to the model


if __name__ == "__main__":
    unittest.main()
