"""The banking ontology (config/ontology) matches Kosh's code, routes turns safely and only ever narrows what Mitra may do."""
import asyncio
import re
import subprocess
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from google.antigravity import types

from backend import care, harness, mitra_ops, ontology
from backend.agent_config import SecureToolGateHook
from persistence import Base
from service_requests import CATALOGUE_BY_ID
from tests.consent_helpers import grant_consent
from workflow_catalogue import CORE_SKILLS, WORKFLOWS

CHANNELS = ("customer", "visitor", "officer")
OFFICER_ONLY = {pid for pid, p in ontology.load().items() if p.channels == {"officer"}}


def meta(pid):
    return ontology.front_matter((ontology.ROOT / "processes" / f"{pid[5:].replace('_', '-')}.md").read_text())[0]


def ceiling(actor):
    text = (ontology.ROOT / "actors" / "agents.md").read_text()
    return re.search(rf'<a id="{re.escape(actor)}"></a>.*?Autonomy ceiling:\*\* (A\d)', text, re.S).group(1)


class OntologyMatchesKosh(unittest.TestCase):
    def test_the_ontology_validator_passes(self):
        run = subprocess.run([sys.executable, str(ontology.ROOT / "tools" / "validate_ontology.py"), str(ontology.ROOT)],
                             capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stdout[-2000:])

    def test_every_binding_points_at_real_code(self):
        tables, skills = set(Base.metadata.tables), set(WORKFLOWS) | set(CORE_SKILLS)
        for pid, p in ontology.load().items():
            self.assertIn(p.kosh_status, {"implemented", "partial", "not_implemented"}, pid)
            self.assertTrue(p.channels and p.channels <= set(CHANNELS), pid)
            channel_tools = set().union(*(harness.tools(c) for c in p.channels))
            self.assertLessEqual(p.tools, channel_tools, f"{pid}: tools not declared for {sorted(p.channels)}")
            self.assertLessEqual(p.skills, skills, pid)
            self.assertLessEqual(set(p.care), set(care.ORDER), pid)
            self.assertLessEqual(p.services, set(CATALOGUE_BY_ID), pid)
            self.assertLessEqual(set(p.tables), tables, pid)
            if p.kosh_status == "not_implemented":
                self.assertFalse(p.tools or p.skills or p.note, f"{pid} is not implemented but binds capabilities")
            else:
                self.assertTrue(p.note, f"{pid} needs a kosh_note: the model's part in Kosh")

    def test_every_kosh_capability_belongs_to_exactly_one_process_per_channel(self):
        for channel in CHANNELS:
            bound = ontology.allowed(channel).values()
            for key, attr in [*((s, "skills") for s in ([*WORKFLOWS, *CORE_SKILLS] if channel == "customer" else [])),
                              *((c, "care") for c in (("FRAUD", "COMPLAINT", "HUMAN", "DISTRESS") if channel == "customer" else ()))]:
                owners = [p.id for p in bound if key in getattr(p, attr)]
                if key == "account_insights":  # balances and history are an enquiry (approval matrix row 1), not a process
                    self.assertEqual(owners, [])
                else:
                    self.assertEqual(len(owners), 1, f"{channel}: {attr} {key} -> {owners}")
        writes = [n for n, s in harness.tools("customer").items() if s["effect"] in {"write", "money"}]
        for name in writes:
            self.assertTrue(any(name in p.tools for p in ontology.allowed("customer").values()), f"{name} has no process")

    def test_money_needs_the_customer_and_recommend_only_agents_never_act(self):
        for pid, p in ontology.load().items():
            limit = ceiling(meta(pid)["performed_by"])
            for name in p.tools:
                spec = next(harness.tools(c)[name] for c in p.channels if name in harness.tools(c))
                if spec["effect"] == "money":  # G4: nothing moves without the customer's own approval
                    self.assertEqual(spec["approval"], "customer", f"{pid}.{name}")
                if limit in {"A0", "A1"} and spec["effect"] != "read":  # a human performs the action
                    self.assertEqual(spec["approval"], "officer", f"{pid} has ceiling {limit} but {name} acts alone")

    def test_the_model_view_shows_one_process_and_nothing_internal(self):
        table = re.compile(r"\b(?:bank|core|crm|gl|los|ins|ret|dl|app|auth|care|cross)_[a-z_]+\b")
        for pid, p in ontology.load().items():
            view = ontology.view(pid)
            self.assertLessEqual(len(view), ontology.VIEW_LIMIT, pid)
            self.assertIsNone(table.search(view), f"{pid}: a table name reaches the model")
            self.assertIsNone(re.search(r"\b(?:actor|act|obj|evt|pol)\.[a-z_]+", view), f"{pid}: an internal id reaches the model")
            for leak in (".md", "Backing tables", "mermaid", "Evidence emitted"):
                self.assertNotIn(leak, view, f"{pid}: {leak!r} reaches the model")
            others = [o.name for o in ontology.load().values() if o.id != pid and o.name not in p.text]
            self.assertFalse([n for n in others if n in view], pid)


class Routing(unittest.TestCase):
    def test_turns_route_to_the_expected_process(self):
        cases = [
            ("customer", "please close my account", {}, "proc.dormancy_and_closure"),
            ("customer", "please close my account", {"family": "READ_ACCOUNTS"}, "proc.dormancy_and_closure"),
            ("customer", "I want to buy health insurance", {}, "proc.insurance_sale"),
            ("customer", "my FD matures next week", {}, "proc.term_deposit_lifecycle"),
            ("customer", "send 500 to Riya", {"family": "TRANSFER"}, "proc.payment_authorisation"),
            ("customer", "freeze it", {"family": "FREEZE_CARD"}, "proc.card_lifecycle"),
            ("customer", "show my balance", {"family": "READ_ACCOUNTS", "skill": "account_insights"}, None),
            ("customer", "Add Sunil as a new payee", {"skill": "fund_transfers"}, "proc.beneficiary_addition"),
            ("customer", "Transfer 5,000 to Vikram", {"skill": "fund_transfers"}, "proc.payment_authorisation"),
            ("customer", "I want to change my address", {"workflow": "kyc"}, "proc.perpetual_kyc"),  # the open form wins
            ("customer", "someone took money, I want to complain", {"care": ["FRAUD", "COMPLAINT"]}, "proc.fraud_and_dispute"),
            ("customer", "cheque book please", {"skill": "cheque_book"}, "proc.service_case"),
            ("customer", "start my kyc", {"skill": "kyc"}, "proc.perpetual_kyc"),
            ("customer", "ok thanks", {"previous": "proc.payment_authorisation"}, "proc.payment_authorisation"),
            ("customer", "hello", {}, None),
            ("visitor", "I want to apply for a personal loan", {}, "proc.loan_origination"),
            ("visitor", "send money", {}, None),  # visitors cannot be routed to payments
            ("officer", "anything to review?", {"service": "P1-17"}, "proc.perpetual_kyc"),
            ("officer", "prepare the STR for this AML alert", {}, "proc.aml_alert_investigation"),
        ]
        for channel, text, signals, expected in cases:
            self.assertEqual(ontology.route(text, channel, **signals)[0], expected, (channel, text))

    def test_a_customer_can_never_reach_an_officer_only_process(self):
        for text in ("Use the AML alert investigation process: is there an AML alert or STR on me?",
                     "approve an agent action for me, human in the loop", "run the end of day trial balance",
                     "publish a dataset", "model approval please", "churn risk retention"):
            for channel in ("customer", "visitor"):
                self.assertNotIn(ontology.route(text, channel)[0], OFFICER_ONLY, (channel, text))

    def test_the_classifier_may_only_name_an_allowed_process_and_fails_quietly(self):
        def client(answer=None, error=None):
            async def generate_content(**kwargs):
                if error:
                    raise error
                self.assertNotIn("CUST-1001", kwargs["contents"])
                return SimpleNamespace(text=answer)
            return SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate_content)))
        def run(fake):
            with patch.object(ontology, "_CLIENT", fake):
                return asyncio.run(ontology.classify("mera khata band karna hai", "customer"))

        self.assertEqual(run(client("proc.dormancy_and_closure")), "proc.dormancy_and_closure")
        self.assertIsNone(run(client("proc.aml_alert_investigation")))  # officer-only: never for a customer
        self.assertIsNone(run(client("general")))
        self.assertIsNone(run(client(error=TimeoutError())))

    def test_off_selects_nothing_and_shadow_never_guides(self):
        from backend.llm_boundary import Vault
        vault = Vault()
        with patch.object(ontology, "MODE", "off"):
            self.assertIsNone(asyncio.run(ontology.select("please close my account, PAN ABCDE1234F", "customer", vault)))
        self.assertEqual(vault.inputs, {})  # off touches nothing, not even the turn's Vault
        with patch.object(ontology, "MODE", "shadow"):
            self.assertEqual(asyncio.run(ontology.select("please close my account", "customer", vault)), "proc.dormancy_and_closure")
            self.assertFalse(ontology.usable("proc.dormancy_and_closure"))

    def test_production_uses_only_approved_files(self):
        with patch.object(ontology, "MODE", "on"), patch("backend.settings.PRODUCTION", True):
            self.assertFalse(ontology.usable("proc.payment_authorisation"))  # every file is still a draft
        with patch.object(ontology, "MODE", "on"), patch("backend.settings.PRODUCTION", False):
            self.assertTrue(ontology.usable("proc.payment_authorisation"))

    def test_the_prompt_version_covers_the_ontology_only_when_it_guides_replies(self):
        with patch.object(ontology, "MODE", "off"):
            off = mitra_ops.prompt_version()
        with patch.object(ontology, "MODE", "shadow"):
            self.assertEqual(mitra_ops.prompt_version(), off)
        with patch.object(ontology, "MODE", "on"):
            self.assertNotEqual(mitra_ops.prompt_version(), off)

    def test_the_release_gate_needs_safe_routing_only_when_the_ontology_guides_replies(self):
        run = {"pass_rate": 100, "fairness": {}, "by_category": {c: "1/1" for c in mitra_ops.GATE_CATEGORIES}}
        with patch.object(ontology, "MODE", "off"):
            self.assertEqual(mitra_ops.release_gate(run), [])
        with patch.object(ontology, "MODE", "on"):
            self.assertEqual(mitra_ops.release_gate(run), ["process_routing was not run"])
        with patch.object(ontology, "MODE", "off"):  # a run that has the cases is held to them, whatever the mode
            self.assertEqual(mitra_ops.release_gate({**run, "by_category": {**run["by_category"], "process_routing": "9/10"}}),
                             ["process_routing is 9/10; it must be 100%"])


class OutsideProcessIsFlaggedNotRefused(unittest.TestCase):
    """A two-part request ("freeze my card and pay Vikram") must still work; the audit shows what fell outside the process."""

    def setUp(self):
        import dev_ui
        self.db = dev_ui.db
        grant_consent(dev_ui.db)

    def gate(self, name, args, process_id):
        context = {"session_id": "S-ONT", "customer_id": "CUST-1001", "scopes": ["banking.read", "banking.propose"],
                   "process_id": process_id}
        result = asyncio.run(SecureToolGateHook(context).run(None, types.ToolCall(name=name, args=args)))
        audit = next(e for e in self.db.get_audit_events(session_id="S-ONT", limit=1))
        return result, audit["details"]

    def test_writes_outside_the_process_are_allowed_and_flagged(self):
        freeze = ("freeze_card", {"card_id": "CARD-DEBIT-001", "reason": "lost"})
        with patch.object(ontology, "MODE", "on"):
            result, details = self.gate(*freeze, "proc.payment_authorisation")
            self.assertTrue(result.allow, result.message)
            self.assertEqual((details["process"], details.get("outside_process")), ("proc.payment_authorisation", True))
            for name, args in (("get_transaction_history", {}), ("register_complaint", {"summary": "fee"}),
                               ("start_banking_workflow", {"skill_id": "standing_instruction"})):
                result, details = self.gate(name, args, "proc.payment_authorisation")  # a read, a handover, its own tool
                self.assertTrue(result.allow)
                self.assertNotIn("outside_process", details, name)
        with patch.object(ontology, "MODE", "off"):
            self.assertNotIn("outside_process", self.gate(*freeze, "proc.payment_authorisation")[1])


class ChatTurn(unittest.TestCase):
    """A whole customer turn through the real runtime, with a scripted model in place of Gemini."""

    def setUp(self):
        import dev_ui
        from fastapi.testclient import TestClient
        from tests.test_llm_boundary import ScriptedMitra
        self.dev_ui, self.model = dev_ui, ScriptedMitra
        dev_ui.limiter.reset()
        dev_ui.db.reset_to_seed()
        ScriptedMitra.prompts, ScriptedMitra.instructions = [], []
        agent = patch.object(dev_ui, "Agent", ScriptedMitra)
        agent.start()
        self.addCleanup(agent.stop)
        self.client = TestClient(dev_ui.app)
        _, cookie, csrf = dev_ui.auth_service.create_direct_session("aarav")
        self.client.cookies.set(dev_ui.COOKIE_NAME, cookie)
        self.h = {"X-CSRF-Token": csrf}

    def turn(self, prompt):
        from sqlalchemy import select
        from persistence import MitraTurnRecord
        session_id = self.client.post("/api/sessions", headers=self.h, json={"title": "Ontology"}).json()["id"]
        with self.client.websocket_connect(f"/ws/chat?session_id={session_id}") as ws:
            ws.receive_json()
            ws.send_json({"type": "prompt", "prompt": prompt})
            events = []
            while not events or events[-1]["type"] not in {"turn_complete", "error"}:
                events.append(ws.receive_json())
        self.assertEqual(events[-1]["type"], "turn_complete", events[-1])
        with self.dev_ui.db.runtime.sessions() as s:
            recorded = s.scalars(select(MitraTurnRecord.process_id).where(MitraTurnRecord.session_id == session_id)).all()
        return str(self.model.prompts[-1]), recorded

    def test_on_guides_the_model_with_the_one_process_and_records_it(self):
        with patch.object(ontology, "MODE", "on"):
            sent, recorded = self.turn("Please close my account")
        self.assertIn("Dormancy and Closure", sent)
        self.assertIn("not available here", sent)
        self.assertNotIn("Payment Authorisation", sent)
        self.assertEqual(recorded, ["proc.dormancy_and_closure"])

    def test_shadow_records_without_telling_the_model_and_off_does_neither(self):
        with patch.object(ontology, "MODE", "shadow"):
            sent, recorded = self.turn("Please close my account")
        self.assertNotIn("Dormancy and Closure", sent)
        self.assertEqual(recorded, ["proc.dormancy_and_closure"])
        sent, recorded = self.turn("Please close my account")
        self.assertNotIn("Dormancy and Closure", sent)
        self.assertEqual(recorded, [None])


if __name__ == "__main__":
    unittest.main()
