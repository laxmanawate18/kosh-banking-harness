import pytest
from banking_tools import build_banking_tools, BANKING_TOOL_NAMES, ALLOWED_PRESENTATIONS


def test_banking_tools_includes_account_opening():
    tools = build_banking_tools(lambda: {"customer_id": "CUST-1001", "user_id": "aarav"})
    names = [t["name"] if isinstance(t, dict) else t.__name__ for t in tools]
    assert "start_account_opening" in names
    assert "check_account_opening_status" in names


def test_banking_tool_names_set():
    assert "start_account_opening" in BANKING_TOOL_NAMES
    assert "check_account_opening_status" in BANKING_TOOL_NAMES


def test_allowed_presentations():
    assert "RPA_ACCOUNT_OPENING_STATUS" in ALLOWED_PRESENTATIONS
    assert "RPA_ACCOUNT_OPENED" in ALLOWED_PRESENTATIONS
