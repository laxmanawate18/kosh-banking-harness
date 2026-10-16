"""A chat's agent is built with the tools of the process the first message routed to; a later message that needs other tools must
get an agent that has them (a chat that opens on "add a payee" must still be able to pay)."""
import asyncio
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

_SUITE_DATABASE = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
os.environ["SENTINEL_DATABASE_URL"] = f"sqlite+pysqlite:///{Path(_SUITE_DATABASE.name) / 'scope.sqlite3'}"

from backend import chat_runtime, ontology
from backend.chat_runtime import SessionManager


class FakeAgent:
    def __init__(self, config):
        self.config = config

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False


def tool_names(agent) -> set:
    return {getattr(t, "__name__", None) or getattr(t, "name", "") for t in getattr(agent.config, "tools", [])}


class AgentScopeTests(unittest.TestCase):
    def session(self):
        auth = SimpleNamespace(user_id="USR-CUSTOMER-001", customer_id="CUST-1001", scopes=["banking.read", "banking.propose"],
                               phone_number=None, assurance_level="L2", role="CUSTOMER")
        built = []
        manager = SessionManager(SimpleNamespace(), auth, lambda config: built.append(FakeAgent(config)) or built[-1])
        return manager, built

    def test_covers(self):
        covers = SessionManager.scope_covers
        self.assertTrue(covers(None, frozenset({"a"})))
        self.assertTrue(covers(None, None))
        self.assertFalse(covers(frozenset({"a"}), None))
        self.assertTrue(covers(frozenset({"a", "b"}), frozenset({"a"})))
        self.assertFalse(covers(frozenset({"a"}), frozenset({"a", "b"})))

    def test_a_later_process_with_money_tools_gets_an_agent_that_has_them(self):
        manager, built = self.session()

        async def run():
            manager.tool_context["process_id"] = "proc.beneficiary_addition"
            first = await manager.get_or_create_agent("m")
            again = await manager.get_or_create_agent("m")
            manager.tool_context["process_id"] = "proc.payment_authorisation"
            second = await manager.get_or_create_agent("m")
            return first, again, second

        first, again, second = asyncio.run(run())
        self.assertIs(first, again)          # the same process reuses the agent
        self.assertIsNot(first, second)      # a process that needs more tools rebuilds it
        self.assertEqual(len(built), 2)
        self.assertNotIn("propose_transfer", tool_names(first))
        self.assertIn("propose_transfer", tool_names(second))

    def test_going_back_to_a_narrower_process_keeps_the_wider_agent(self):
        manager, built = self.session()

        async def run():
            manager.tool_context["process_id"] = "proc.payment_authorisation"
            wide = await manager.get_or_create_agent("m")
            manager.tool_context["process_id"] = "proc.beneficiary_addition"
            narrow = await manager.get_or_create_agent("m")
            return wide, narrow

        wide, narrow = asyncio.run(run())
        self.assertIs(wide, narrow)
        self.assertEqual(len(built), 1)

    def test_the_declared_tools_really_differ(self):  # guards the two tests above against a changed ontology
        pay = ontology.scoped_tool_names("proc.payment_authorisation")
        payee = ontology.scoped_tool_names("proc.beneficiary_addition")
        self.assertIn("propose_transfer", pay)
        self.assertNotIn("propose_transfer", payee)


if __name__ == "__main__":
    unittest.main()
