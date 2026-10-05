"""The tool registry is the single source of truth: it matches the real tools, and the gate enforces it."""
import asyncio
import inspect
import unittest

from google.antigravity import types

from backend import harness
from tests.consent_helpers import grant_consent
from backend.agent_config import PublicSalesToolGateHook, SecureToolGateHook
from banking_tools import build_banking_tools
from product_service import VISITOR_APPLICATION_TOOL_NAMES, SalesSessionContext, build_public_sales_tools


def _signature(tool):
    params = inspect.signature(tool).parameters
    return {k: p.default is inspect.Parameter.empty for k, p in params.items()}


def _channel_tools():
    public = build_public_sales_tools(lambda: SalesSessionContext())
    customer = {t.__name__: t for t in public if t.__name__ not in VISITOR_APPLICATION_TOOL_NAMES}
    customer.update({t.__name__: t for t in build_banking_tools(dict)})  # the banking version wins, as in the agent
    return {"customer": customer, "visitor": {t.__name__: t for t in public}}


class RegistryTests(unittest.TestCase):
    def test_every_real_tool_is_declared_with_its_exact_arguments(self):
        for channel, real in _channel_tools().items():
            declared = harness.tools(channel)
            self.assertEqual(set(real), set(declared), f"{channel}: tools and registry differ")
            for name, fn in real.items():
                spec = declared[name]["args"]
                self.assertEqual(set(_signature(fn)), set(spec), f"{channel}.{name} arguments")
                for arg, required in _signature(fn).items():
                    self.assertEqual(bool(spec[arg].get("required")), required, f"{channel}.{name}.{arg} required flag")
                self.assertIn(declared[name]["effect"], {"read", "write", "money"})
                self.assertIn(declared[name]["approval"], {"none", "customer", "officer"})

    def test_money_tools_always_need_the_customer_and_a_propose_scope(self):
        for name, spec in harness.tools("customer").items():
            if spec["effect"] == "money":
                self.assertEqual((spec["approval"], spec["scopes"]), ("customer", ["banking.propose"]), name)

    def setUp(self):
        import dev_ui
        grant_consent(dev_ui.db)

    def gate(self, name, args, **ctx):
        context = {"session_id": "S-REG", "customer_id": "CUST-1001", "scopes": ["banking.read", "banking.propose"], **ctx}
        return asyncio.run(SecureToolGateHook(context).run(None, types.ToolCall(name=name, args=args)))

    def test_gate_checks_types_limits_and_formats(self):
        ok = {"beneficiary_id": "BEN-VIKRAM", "amount_minor": 100, "source_account_id": "ACC-SAL-001"}
        self.assertTrue(self.gate("propose_transfer", ok).allow)
        self.assertTrue(self.gate("propose_transfer", {**ok, "amount_minor": 100.0}).allow)  # integral float
        for bad in ({"amount_minor": "100"}, {"amount_minor": 0}, {"amount_minor": 1.5}, {"beneficiary_id": "../etc"},
                    {"source_account_id": None}, {"note": "x" * 500}, {"otp": "123456"}):
            self.assertFalse(self.gate("propose_transfer", {**ok, **bad}).allow, bad)
        self.assertFalse(self.gate("get_transaction_history", {"limit": 5000}).allow)

    def test_scopes_and_customer_are_enforced(self):
        read_only = ["banking.read"]
        self.assertTrue(self.gate("get_customer_summary", {}, scopes=read_only).allow)
        denied = self.gate("freeze_card", {"card_id": "CARD-DEBIT-5521", "reason": "lost"}, scopes=read_only)
        self.assertFalse(denied.allow)
        self.assertIn("banking.propose", denied.message)
        self.assertIn("AUTH_REQUIRED", self.gate("get_customer_summary", {}, customer_id=None).message)  # e.g. an officer

    def test_visitor_gate_uses_the_visitor_section(self):
        gate = PublicSalesToolGateHook("S-VIS")
        run = lambda name, args: asyncio.run(gate.run(None, types.ToolCall(name=name, args=args)))
        self.assertTrue(run("register_complaint", {"full_name": "Asha", "mobile": "9876543210", "summary": "Charged twice"}).allow)
        self.assertFalse(run("register_complaint", {"full_name": "Asha", "mobile": "call me", "summary": "x"}).allow)
        self.assertIn("AUTH_REQUIRED", run("propose_transfer", {}).message)


if __name__ == "__main__":
    unittest.main()


class NoDefaultCustomerTests(unittest.TestCase):
    def test_agent_for_a_user_without_a_customer_record_gets_no_banking_tools(self):
        from backend.agent_config import create_agent_config
        context = {"session_id": "S-OFFICER", "user_id": "USR-OFFICER-001", "customer_id": None,
                   "scopes": ["banking.read", "banking.propose"]}
        config = create_agent_config("S-OFFICER", session_context=context)
        self.assertIsNone(context["customer_id"])  # no silent fallback to the demo customer
        gate = next(h for h in config.hooks if isinstance(h, SecureToolGateHook))
        denied = asyncio.run(gate.run(None, types.ToolCall(name="get_customer_summary", args={})))
        self.assertFalse(denied.allow)
        self.assertIn("AUTH_REQUIRED", denied.message)
