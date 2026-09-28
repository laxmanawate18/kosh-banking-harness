import pytest
from fastapi.testclient import TestClient

from auth_service import AuthService
from banking_db import db
from dev_ui import app


@pytest.fixture
def client():
    return TestClient(app)


def test_officer_customers_list_and_wipe(client):
    auth_service = AuthService(db.runtime)

    # 1. Login as officer
    ctx, officer_token, csrf = auth_service.create_direct_session("officer.mumbai")
    client.cookies.set("sentinel_session", officer_token)

    # 2. Get customer list
    resp = client.get("/api/officer/customers")
    assert resp.status_code == 200, resp.text
    customers = resp.json().get("customers", [])
    assert isinstance(customers, list)
    assert len(customers) > 0

    # 3. Create a test customer & profile to wipe
    import secrets
    rnd = secrets.token_hex(3)
    test_phone = f"+9199{secrets.randbelow(90000000) + 10000000}"
    test_user = f"user_{rnd}"
    onboarded = db.onboard_customer_with_product(
        product={"id": "PROD-SAV-PREMIER", "title": "Test Savings", "category": "savings"},
        full_name="Wipe Test User",
        phone_number=test_phone,
        username=test_user,
    )
    cust_id = onboarded["customer_id"]
    auth_service.create_onboarded_profile(
        full_name="Wipe Test User",
        phone_number=test_phone,
        username=test_user,
        customer_id=cust_id,
    )

    # Verify profile exists
    assert auth_service.profile_exists(test_phone) is True
    assert db.get_customer(cust_id) is not None

    # Check that test customer appears in list
    resp = client.get("/api/officer/customers")
    found = [c for c in resp.json().get("customers", []) if c["customer_id"] == cust_id]
    assert len(found) == 1
    assert found[0]["phone_number"] == test_phone
    assert found[0]["username"] == test_user

    # 4. Officer wipes the customer
    del_resp = client.delete(f"/api/officer/customers/{cust_id}")
    assert del_resp.status_code == 200, del_resp.text
    data = del_resp.json()
    assert data["success"] is True
    assert data["customer_id"] == cust_id

    # 5. Verify customer is completely wiped
    assert auth_service.profile_exists(test_phone) is False
    assert db.get_customer(cust_id) is None
    assert len(db.get_accounts(cust_id)) == 0

    # Verify customer no longer in list
    resp = client.get("/api/officer/customers")
    found_after = [c for c in resp.json().get("customers", []) if c["customer_id"] == cust_id]
    assert len(found_after) == 0


def test_non_officer_cannot_wipe_customer(client):
    auth_service = AuthService(db.runtime)
    # Login as normal customer (Aarav)
    ctx, user_token, csrf = auth_service.create_direct_session("aarav")
    client.cookies.set("sentinel_session", user_token)

    resp = client.get("/api/officer/customers")
    assert resp.status_code == 403

    del_resp = client.delete("/api/officer/customers/CUST-1001")
    assert del_resp.status_code == 403
