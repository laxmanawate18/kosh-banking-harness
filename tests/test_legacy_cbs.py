"""The legacy core (mock): screens only, its own database, its own operators and maker-checker rule, isolated from Kosh."""
import re
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture
def core(tmp_path, monkeypatch):
    monkeypatch.setenv("LEGACY_CBS_DATABASE_URL", f"sqlite+pysqlite:///{tmp_path / 'legacy.sqlite3'}")
    from legacy_cbs.app import app
    return app


def _signed_in(app, operator, password):
    client = TestClient(app)
    page = client.post("/login", data={"operator_id": operator, "password": password})
    assert 'id="mnuMain"' in page.text, page.text
    return client


def _maker(app):
    return _signed_in(app, "RPA-MAKER", "maker-demo")


def _checker(app):
    return _signed_in(app, "RPA-CHECKER", "checker-demo")


def _new_customer(client, ref, pan="ABCPS1234K"):
    return client.post("/customer/new", data={
        "customerName": "Riya Shah", "panNumber": pan, "dateOfBirth": "14/08/1994", "mobileNumber": "9820515974",
        "email": "riya@example.com", "residentialAddress": "12 Lake Road", "city": "Pune", "pincode": "411001",
        "portalReference": ref})


def _id(page, element):
    match = re.search(rf'id="{element}">([^<]+)<', page.text)
    return match and match.group(1)


def test_screens_only_no_api(core):
    paths = {route.path for route in core.routes}
    assert not {"/openapi.json", "/docs", "/redoc"} & paths
    anonymous = TestClient(core)
    for path in ("/", "/menu", "/enquiry", "/customer/new", "/account/new", "/deposit/new", "/authorise"):
        page = anonymous.get(path)
        assert page.headers["content-type"].startswith("text/html") and 'id="frmLogin"' in page.text  # sign in first


def test_wrong_password_is_refused(core):
    page = TestClient(core).post("/login", data={"operator_id": "RPA-MAKER", "password": "nope"})
    assert "Invalid operator ID or password" in page.text


def test_new_customer_and_savings_account_wait_for_a_different_checker(core):
    maker = _maker(core)
    customer = _new_customer(maker, "SAV-APP-0000AAAA")
    cif = _id(customer, "lblCifNumber")
    assert cif == "CIF0001003" and _id(customer, "lblStatus") == "PENDING_AUTH"
    account = maker.post("/account/new", data={"cif": cif, "schemeCode": "SB_GEN_IND", "nomineeName": "Asha Shah",
                                                "nomineeRelationship": "MOTHER", "portalReference": "SAV-APP-0000AAAA"})
    number = _id(account, "lblAcctNumber")
    assert number == "109200010001"
    found = maker.get("/enquiry", params={"ref": "SAV-APP-0000AAAA"})
    assert _id(found, "lblResultCount") == "2" and 'data-status="PENDING_AUTH"' in found.text
    assert "needs a CHECKER operator" in maker.post("/authorise", data={"portalReference": "SAV-APP-0000AAAA"}).text
    checker = _checker(core)
    assert "needs a MAKER operator" in checker.post("/customer/new", data={}).text
    done = checker.post("/authorise", data={"portalReference": "SAV-APP-0000AAAA"})
    assert _id(done, "lblStatus") == "ACTIVE" and _id(done, "lblNewCif") == cif and _id(done, "lblAcctNumber") == number
    assert _id(done, "lblCheckerRef").startswith("AUTH")
    assert "Nothing pending" in checker.post("/authorise", data={"portalReference": "SAV-APP-0000AAAA"}).text


def test_duplicates_are_refused_so_a_retry_never_opens_two(core):
    maker = _maker(core)
    assert "DUPLICATE PAN: customer CIF0001001" in _new_customer(maker, "SAV-APP-0000BBBB", pan="ABCPM0001M").text
    cif = _id(_new_customer(maker, "SAV-APP-0000CCCC"), "lblCifNumber")
    first = maker.post("/account/new", data={"cif": cif, "schemeCode": "SB_GEN_IND", "portalReference": "SAV-APP-0000CCCC"})
    assert _id(first, "lblAcctNumber")
    again = maker.post("/account/new", data={"cif": cif, "schemeCode": "SB_GEN_IND", "portalReference": "SAV-APP-0000CCCC"})
    assert "DUPLICATE REFERENCE" in again.text
    assert "Invalid fields: panNumber" in _new_customer(maker, "SAV-APP-0000DDDD", pan="BAD").text


def test_existing_customer_found_by_pan_and_fd_funded_from_their_own_account(core):
    maker = _maker(core)
    found = maker.get("/enquiry", params={"pan": "ABCPM0001M"})
    assert 'data-kind="CUSTOMER" data-number="CIF0001001"' in found.text and 'data-number="109200004821"' in found.text
    refused = maker.post("/deposit/new", data={"cif": "CIF0001001", "fundingAccount": "109200004797", "amount": "25000.00",
                                               "tenureMonths": "12", "maturityInstruction": "RENEW_PRINCIPAL", "portalReference": "FD-APP-0000AAAA"})
    assert "is not an active account of CIF CIF0001001" in refused.text  # Sudhir's account
    booked = maker.post("/deposit/new", data={"cif": "CIF0001001", "fundingAccount": "109200004821", "amount": "25000.00",
                                              "tenureMonths": "12", "maturityInstruction": "RENEW_PRINCIPAL", "portalReference": "FD-APP-0000AAAA"})
    assert _id(booked, "lblFdNumber") == "FD0000001043" and _id(booked, "lblRate") == "8.10"
    done = _checker(core).post("/authorise", data={"portalReference": "FD-APP-0000AAAA"})
    assert _id(done, "lblFdNumber") == "FD0000001043" and _id(done, "lblCifNumber") == "CIF0001001"


def test_kosh_never_reaches_into_the_legacy_core():
    """Kosh may start the legacy server; it may not import the legacy database or screens."""
    tracked = subprocess.run(["git", "ls-files", "*.py"], cwd=ROOT, capture_output=True, text=True).stdout.split()
    offenders = []
    for path in tracked:
        if path.startswith(("legacy_cbs/", "tests/")):
            continue
        text = (ROOT / path).read_text(encoding="utf-8", errors="ignore")
        if re.search(r"(from|import)\s+legacy_cbs(\.(store|app)|\s+import\s+(store|app))", text):
            offenders.append(path)
    assert offenders == []


def test_server_listens_only_inside_the_container(core, monkeypatch):
    import socket
    import urllib.request
    from legacy_cbs import server
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        monkeypatch.setattr(server, "PORT", probe.getsockname()[1])
    url = server.start_in_background()
    assert url.startswith("http://127.0.0.1:")
    assert 'id="frmLogin"' in urllib.request.urlopen(url + "/login", timeout=5).read().decode()
