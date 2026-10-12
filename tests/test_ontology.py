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

    def test_production_uses_only_approved_processes(self):
        with patch("backend.settings.PRODUCTION", True):
            self.assertFalse(ontology.usable("proc.payment_authorisation"))  # never approved in the test database
        with patch("backend.settings.PRODUCTION", False):
            self.assertTrue(ontology.usable("proc.payment_authorisation"))

    def test_the_prompt_version_covers_every_guide_as_the_model_reads_it(self):
        before = mitra_ops.prompt_version()
        ontology.view.cache_clear()
        with patch.object(ontology, "_guardrails", return_value=["G1 Reworded by a code change."]):
            self.assertNotEqual(mitra_ops.prompt_version(), before)  # what the model reads changed: a new version
        ontology.view.cache_clear()
        self.assertEqual(mitra_ops.prompt_version(), before)

    def test_the_release_gate_needs_safe_routing(self):
        run = {"pass_rate": 100, "fairness": {}, "by_category": {c: "1/1" for c in mitra_ops.GATE_CATEGORIES}}
        self.assertEqual(mitra_ops.release_gate(run), [])
        self.assertIn("process_routing was not run", mitra_ops.release_gate({**run, "by_category": {"care_fraud": "1/1"}}))
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
        result, details = self.gate(*freeze, "proc.payment_authorisation")
        self.assertTrue(result.allow, result.message)
        self.assertEqual((details["process"], details.get("outside_process")), ("proc.payment_authorisation", True))
        for name, args in (("get_transaction_history", {}), ("register_complaint", {"summary": "fee"}),
                           ("start_banking_workflow", {"skill_id": "standing_instruction"})):
            result, details = self.gate(name, args, "proc.payment_authorisation")  # a read, a handover, its own tool
            self.assertTrue(result.allow)
            self.assertNotIn("outside_process", details, name)
        self.assertNotIn("outside_process", self.gate(*freeze, None)[1])  # no process routed: nothing to compare with


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

    def test_the_model_is_guided_by_the_one_process_and_the_turn_records_it(self):
        sent, recorded = self.turn("Please close my account")
        self.assertIn("Dormancy and Closure", sent)
        self.assertIn("not available here", sent)
        self.assertNotIn("Payment Authorisation", sent)
        self.assertEqual(recorded, ["proc.dormancy_and_closure"])

    def test_a_process_that_may_not_guide_is_still_recorded(self):  # e.g. not approved in production (unit test above)
        with patch.object(ontology, "usable", return_value=False):
            sent, recorded = self.turn("Please close my account")
        self.assertNotIn("Dormancy and Closure", sent)
        self.assertEqual(recorded, ["proc.dormancy_and_closure"])


class OntologyMappingAndStateEngineTests(unittest.TestCase):
    def test_graph_structure_and_focused_subgraph(self):
        g = ontology.graph()
        self.assertGreater(g["stats"]["total_nodes"], 20)
        self.assertGreater(g["stats"]["total_raw_edges"], 500)
        self.assertIsNone(g["focused_process"])

        sub = ontology.graph("proc.account_opening")
        self.assertEqual(sub["focused_process"], "proc.account_opening")
        self.assertTrue(any(n["id"] == "proc.account_opening" for n in sub["nodes"]))
        self.assertTrue(any(n["type"] == "activity" for n in sub["nodes"]))
        self.assertTrue(any(n["type"] == "tool" for n in sub["nodes"]))
        self.assertTrue(any(e["relation"] == "HAS_TOOL" for e in sub["edges"]))

    def test_routing_simulator_diagnostics(self):
        sim = ontology.simulate("please block my lost card", "customer")
        self.assertEqual(sim["matched_process_id"], "proc.card_lifecycle")
        self.assertEqual(sim["rule_matched"], "trigger")
        self.assertIn("proc.card_lifecycle", sim["rule_explanation"])
        self.assertIn("freeze_card", sim["allowed_tools"])
        self.assertTrue(len(sim["governing_policies"]) > 0)

        # Simulation with care intent
        care_sim = ontology.simulate("I lost all my money to a scam", "customer", care_intents=("FRAUD",))
        self.assertEqual(care_sim["matched_process_id"], "proc.fraud_and_dispute")
        self.assertEqual(care_sim["rule_matched"], "care")

    def test_state_machine_transition_validation(self):
        # Valid account transitions
        ok, msg = ontology.validate_transition("obj.account", "OPEN", "FROZEN")
        self.assertTrue(ok)
        ok, msg = ontology.validate_transition("obj.account", "FROZEN", "OPEN")
        self.assertTrue(ok)

        # Invalid account transition: cannot go from CLOSED to OPEN (terminal state)
        ok, msg = ontology.validate_transition("obj.account", "CLOSED", "OPEN")
        self.assertFalse(ok)
        self.assertIn("cannot transition from 'CLOSED' to 'OPEN'", msg)

        # Application transitions
        ok, _ = ontology.validate_transition("obj.account_application", "SUBMITTED", "UNDER_REVIEW")
        self.assertTrue(ok)
        ok, _ = ontology.validate_transition("obj.account_application", "UNDER_REVIEW", "APPROVED")
        self.assertTrue(ok)
        ok, _ = ontology.validate_transition("obj.account_application", "APPROVED", "OPENED")
        self.assertFalse(ok)  # Must go through maker / checker

    def test_governed_ontology_parameters(self):
        params = ontology.ontology_parameters()
        self.assertEqual(len(params), 10)
        param_ids = {p["id"] for p in params}
        self.assertIn("PARAM_AGENT_PAYMENT_LIMIT", param_ids)
        self.assertIn("PARAM_STEP_UP_MAX_FAILURES", param_ids)
        self.assertIn("PARAM_NEW_PAYEE_COOLING_HOURS", param_ids)
        for p in params:
            self.assertTrue(p["is_set"])
            self.assertIsNotNone(p["value"])

    def test_runtime_card_state_machine_enforcement(self):
        from core_banking import MockCoreBanking
        from banking_tools import SecureBankingService
        from sentinel import SentinelService
        from banking_db import db as repo
        core = MockCoreBanking(repo)
        
        # Seed a test card in terminal state
        repo.transaction(lambda data: data["cards"].update({
            "CARD-TERMINAL": {
                "id": "CARD-TERMINAL", "customer_id": "CUST-1001", "account_id": "ACC-SAL-001",
                "card_number_masked": "•••• 9999", "status": "CANCELLED", "type": "DEBIT"
            }
        }))
        
        # Core banking must reject transition from terminal state
        with self.assertRaises(ValueError) as ctx:
            core.set_card_status("CARD-TERMINAL", "ACTIVE", idempotency_key="key-test-terminal", reason="attempted unfreeze")
        self.assertIn("ILLEGAL_CARD_STATE_TRANSITION", str(ctx.exception))

        # SecureBankingService.freeze_card must reject transition from terminal state
        service = SecureBankingService(repo, SentinelService(repo, "test-secret"))
        ctx_session = {"customer_id": "CUST-1001", "session_id": "S-TEST", "device_id": "DEV-1"}
        result = service.freeze_card(ctx_session, "CARD-TERMINAL", "freeze attempted on cancelled card")
        self.assertFalse(result["success"])
        self.assertEqual(result["status"], "DENIED")
        self.assertIn("Card transition denied", result["error"])

    def test_dynamic_tool_scoping_and_pruning(self):
        from backend.agent_config import create_agent_config, SecureToolGateHook
        from google.antigravity import types
        
        # Check scoped tool names
        card_tools = ontology.scoped_tool_names("proc.card_lifecycle")
        self.assertIsNotNone(card_tools)
        self.assertIn("freeze_card", card_tools)
        self.assertIn("get_security_alerts", card_tools)
        self.assertIn("get_customer_summary", card_tools)      # safe ambient
        self.assertNotIn("propose_transfer", card_tools)       # out of scope
        self.assertNotIn("propose_bill_payment", card_tools)   # out of scope

        pay_tools = ontology.scoped_tool_names("proc.payment_authorisation")
        self.assertIsNotNone(pay_tools)
        self.assertIn("propose_transfer", pay_tools)
        self.assertIn("propose_bill_payment", pay_tools)
        self.assertNotIn("freeze_card", pay_tools)

        # Agent config created for proc.card_lifecycle omits transfer tools
        config = create_agent_config(
            session_id="S-SCOPED",
            session_context={"customer_id": "CUST-1001", "process_id": "proc.card_lifecycle"},
            process_id="proc.card_lifecycle"
        )
        tool_names = {getattr(t, "__name__", None) or getattr(t, "name", None) for t in config.tools}
        self.assertIn("freeze_card", tool_names)
        self.assertNotIn("propose_transfer", tool_names)

        # Strict tool gate hook enforcement
        gate_context = {
            "session_id": "S-STRICT",
            "customer_id": "CUST-1001",
            "scopes": ["banking.read", "banking.propose"],
            "process_id": "proc.card_lifecycle",
            "enforce_ontology_scoping": True
        }
        gate = SecureToolGateHook(gate_context, enforce_scoping=True)
        transfer_call = types.ToolCall(name="propose_transfer", args={"amount_minor": 1000})
        res = gate.decide(transfer_call)
        self.assertFalse(res.allow)
        self.assertIn("ONTOLOGY_TOOL_DENIED", res.message)

    def test_runtime_governed_policy_parameters_in_sentinel(self):
        from datetime import datetime, timezone
        from banking_tools import SecureBankingService
        from sentinel import SentinelService, IntentResolver
        from banking_db import db as repo
        repo.update_kyc_status("CUST-1001", "VERIFIED")
        service = SecureBankingService(repo, SentinelService(repo, "test-secret"))
        resolver = IntentResolver(repo)

        # 1. Transfer above agent payment limit (₹30,000 > ₹25,000 PARAM_AGENT_PAYMENT_LIMIT)
        intent = resolver.resolve("Transfer ₹30,000 to Vikram", "S-PARAM", "t-param-1")
        context = {
            "session_id": "S-PARAM", "turn_id": intent["turn_id"], "intent": intent,
            "customer_id": "CUST-1001", "device_id": "DEVICE-KNOWN-01"
        }
        res = service.propose_transfer(context, "BEN-VIKRAM", 3000000, "ACC-SAL-001")
        decision = res.get("sentinel") or {}
        self.assertIn("EXCEEDS_AGENT_PAYMENT_LIMIT", decision.get("reason_codes", []))

        # 2. Transfer to newly added beneficiary in cooling-off period (₹15,000 > ₹10,000 limit)
        now_iso = (datetime.now(timezone.utc)).isoformat().replace("+00:00", "Z")
        repo.transaction(lambda data: data["beneficiaries"].update({
            "BEN-NEW-TEST": {
                "id": "BEN-NEW-TEST", "customer_id": "CUST-1001", "display_name": "New Contact",
                "destination_masked": "•••• 1234", "kind": "PERSON", "relationship": "NEW",
                "created_at": now_iso, "risk_status": "NORMAL"
            }
        }))
        intent_cool = resolver.resolve("Transfer ₹15,000 to New Contact", "S-COOL", "t-cool-1")
        context_cool = {
            "session_id": "S-COOL", "turn_id": intent_cool["turn_id"], "intent": intent_cool,
            "customer_id": "CUST-1001", "device_id": "DEVICE-KNOWN-01"
        }
        res_cool = service.propose_transfer(context_cool, "BEN-NEW-TEST", 1500000, "ACC-SAL-001")
        decision_cool = res_cool.get("sentinel") or {}
        self.assertIn("COOLING_OFF_PERIOD_ACTIVE", decision_cool.get("reason_codes", []))
        self.assertIn("COOLING_OFF_LIMIT_EXCEEDED", decision_cool.get("reason_codes", []))


if __name__ == "__main__":
    unittest.main()
