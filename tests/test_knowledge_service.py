"""Unit tests for the file-based SQLite RAG knowledge service and tools."""

import unittest

from banking_tools import BANKING_TOOL_NAMES, build_banking_tools
from knowledge_service import ingest_documents, sanitize_query, search_bank_knowledge
from product_service import PUBLIC_SALES_TOOL_NAMES, SalesSessionContext, build_public_sales_tools


class KnowledgeServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.count = ingest_documents(force=True)

    def test_documents_ingested(self):
        self.assertGreater(self.count, 20)

    def test_sanitize_query(self):
        sanitized = sanitize_query("What is the penalty for early FD withdrawal?")
        self.assertIn("penalty", sanitized)
        self.assertIn("withdrawal", sanitized)
        self.assertNotIn("What", sanitized)

    def test_search_fixed_deposit_penalty(self):
        results = search_bank_knowledge("premature withdrawal penalty fixed deposit")
        self.assertGreater(len(results), 0)
        top = results[0]
        self.assertIn("Premature Withdrawal", top["section_title"])
        self.assertIn("0.50%", top["content"])
        self.assertIn("citation", top)

    def test_search_positive_pay_system(self):
        results = search_bank_knowledge("positive pay system threshold cheques")
        self.assertGreater(len(results), 0)
        found_pps = any("Positive Pay" in r["section_title"] for r in results)
        self.assertTrue(found_pps)
        combined = " ".join(r["content"] for r in results)
        self.assertIn("50,000", combined)

    def test_search_dicgc_insurance(self):
        results = search_bank_knowledge("DICGC deposit insurance protection")
        self.assertGreater(len(results), 0)
        combined = " ".join(r["content"] for r in results)
        self.assertIn("5,00,000", combined)

    def test_category_filter(self):
        results = search_bank_knowledge("lounge access metal card", category="cards")
        self.assertGreater(len(results), 0)
        for r in results:
            self.assertEqual(r["category"], "cards")

    def test_sales_tool_query_bank_knowledge(self):
        self.assertIn("query_bank_knowledge", PUBLIC_SALES_TOOL_NAMES)
        sales_context = SalesSessionContext()
        tools = build_public_sales_tools(lambda: sales_context)
        tool_map = {t.__name__: t for t in tools}
        self.assertIn("query_bank_knowledge", tool_map)

        res = tool_map["query_bank_knowledge"]("airport lounge access obsidian")
        self.assertIn("passages", res)
        self.assertGreater(res["results_count"], 0)
        self.assertEqual(res["fact_source"], "sentinel_official_documentation_corpus")

    def test_banking_tool_query_bank_knowledge(self):
        self.assertIn("query_bank_knowledge", BANKING_TOOL_NAMES)
        ctx = {"customer_id": "CUST-001", "user_id": "USER-001"}
        tools = build_banking_tools(lambda: ctx)
        tool_map = {t.__name__: t for t in tools}
        self.assertIn("query_bank_knowledge", tool_map)

        res = tool_map["query_bank_knowledge"]("CTS 2010 cheque clearing speed")
        self.assertIn("passages", res)
        self.assertGreater(res["results_count"], 0)


if __name__ == "__main__":
    unittest.main()
