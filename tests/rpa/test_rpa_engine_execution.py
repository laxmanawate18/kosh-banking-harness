import pytest
from rpa.models import AccountApplicationSnapshot, JobStatus


@pytest.mark.asyncio
async def test_rpa_executor_end_to_end_against_mock_cbs(cbs_url):
    snapshot = AccountApplicationSnapshot(
        application_reference="APP-2026-9812",
        customer_name="Aarav Mehta",
        pan="ABCDE1234F",
        aadhaar_last4="9812",
        dob="1990-05-15",
        mobile="9876543210",
        email="aarav.mehta@example.com",
        address_line="Flat 402 Sea Breeze Apts",
        city="Mumbai",
        pincode="400050",
        account_type="SAVINGS_INDIVIDUAL",
    )

    from rpa.rpa_runner import RPARunner
    runner = RPARunner(cbs_base_url=cbs_url)
    result = await runner.run_account_opening(snapshot)

    assert result["status"] == JobStatus.COMPLETED
    assert result["cif_number"].startswith("CIF-")
    assert result["account_number"].startswith("1092")
    assert result["read_back_verified"] is True


@pytest.mark.asyncio
async def test_rpa_progress_callback_receives_screenshots(cbs_url):
    snapshot = AccountApplicationSnapshot(
        application_reference="APP-2026-9813",
        customer_name="Priya Sharma",
        pan="ABCDE5678G",
        aadhaar_last4="5678",
        dob="1992-08-20",
        mobile="9876543211",
        email="priya.sharma@example.com",
        address_line="Flat 101 Lotus Residency",
        city="Bangalore",
        pincode="560001",
        account_type="SAVINGS_INDIVIDUAL",
    )
    events = []
    from rpa.rpa_runner import RPARunner
    runner = RPARunner(cbs_base_url=cbs_url, headless=True,
                       progress_callback=lambda ev: events.append(ev))
    result = await runner.run_account_opening(snapshot)
    assert result["status"] == JobStatus.COMPLETED
    screenshots = [ev["screenshot"] for ev in events if ev.get("screenshot")]
    assert len(screenshots) > 0
    assert screenshots[0].startswith("data:image/jpeg;base64,")

