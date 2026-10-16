"""The admin's ontology copilot answers a typed question (it used to fail with a NameError before it reached the model)."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

_DATABASE = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
os.environ.setdefault("SENTINEL_DATABASE_URL", f"sqlite+pysqlite:///{Path(_DATABASE.name) / 'copilot.sqlite3'}")

from fastapi.testclient import TestClient  # noqa: E402

import dev_ui  # noqa: E402


class TypedQuestionTests(unittest.TestCase):
    def test_a_typed_question_gets_an_answer_without_a_model(self):
        client = TestClient(dev_ui.app)
        _, cookie, csrf = dev_ui.auth_service.create_direct_session("admin.kosh")
        client.cookies.set(dev_ui.COOKIE_NAME, cookie)
        no_model = {"GEMINI_API_KEY": "", "GOOGLE_API_KEY": ""}
        with patch.dict(os.environ, no_model), patch("backend.settings.USE_VERTEXAI", False):  # the offline answer: no Gemini call in a test
            res = client.post("/api/admin/ontology/proc.payment_authorisation/copilot", headers={"X-CSRF-Token": csrf},
                              json={"quick_action": "", "message": "Does this process respect four-eyes?"})
        self.assertEqual(res.status_code, 200, res.text)
        self.assertTrue(res.json()["reply"])


if __name__ == "__main__":
    unittest.main()
