import pytest
from workflow_catalogue import WORKFLOWS
from service_requests import CATALOGUE_BY_ID


def test_account_opening_workflow_definition():
    assert "account_opening" in WORKFLOWS
    wf = WORKFLOWS["account_opening"]
    assert wf["service_id"] == "P1-25"
    assert wf["level"] == "L3"
    assert wf["documents"] is True

    field_keys = [f["key"] for f in wf["fields"]]
    assert "account_scheme" in field_keys
    assert "full_name" in field_keys
    assert "pan_number" in field_keys
    assert "date_of_birth" in field_keys
    assert "mobile" in field_keys
    assert "email" in field_keys
    assert "address" in field_keys
    assert "city" in field_keys
    assert "pincode" in field_keys


def test_account_opening_service_catalogue():
    assert "P1-25" in CATALOGUE_BY_ID
    svc = CATALOGUE_BY_ID["P1-25"]
    assert svc["name"] == "Savings account opening with CBS RPA entry"
    assert svc["mode"] == "HUMAN_APPROVAL"
    assert svc["auth_level"] == "L3"
