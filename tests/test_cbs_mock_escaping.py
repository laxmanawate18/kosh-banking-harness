"""The mock core-banking page is reachable on the deployed app without signing in, so it must not echo input as HTML."""
import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from rpa import cbs_mock_server


class MockCoreEscapingTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(cbs_mock_server.cbs_router)
        self.client = TestClient(app)

    def test_a_script_in_the_reference_is_shown_as_text(self):
        reply = self.client.post("/cbs/retail/submit", data={"customerName": "A", "panNumber": "ABCDE1234F",
                                                             "portalReference": "<script>alert(1)</script>"})
        self.assertEqual(reply.status_code, 200)
        self.assertNotIn("<script>", reply.text)
        self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", reply.text)

    def test_an_ordinary_reference_is_unchanged_and_numbering_continues(self):
        first = self.client.post("/cbs/retail/submit", data={"customerName": "A", "panNumber": "P", "portalReference": "APP-1"}).text
        second = self.client.post("/cbs/retail/submit", data={"customerName": "A", "panNumber": "P", "portalReference": "APP-2"}).text
        self.assertIn("APP-1", first)
        cif = lambda html: int(html.split("CIF-")[1].split("<")[0])
        self.assertEqual(cif(second), cif(first) + 1)

    def test_memory_is_bounded(self):
        for n in range(cbs_mock_server.MAX_KEPT + 20):
            self.client.post("/cbs/retail/submit", data={"customerName": "A", "panNumber": "P", "portalReference": f"R-{n}"})
        self.assertLessEqual(len(cbs_mock_server.submitted_records), cbs_mock_server.MAX_KEPT)


if __name__ == "__main__":
    unittest.main()
