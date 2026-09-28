"""Synthetic backend fixtures. No identity provider result is fabricated as verified."""
import base64
import io
from unittest.mock import patch

from PIL import Image


KYC_FIELDS = {"update_type":"INITIAL_KYC", "full_name":"Aarav Mehta", "date_of_birth":"1990-01-01",
    "pan_route":"PAN", "pan_number":"AAAPM1001M", "identity_document":"PASSPORT", "document_last4":"4567",
    "document_expiry":"2030-01-01", "address":"12B Sea Green Apartments, Worli", "city":"Mumbai", "state":"Maharashtra",
    "pincode":"400018", "occupation":"SALARIED", "annual_income_slab":"15L_TO_50L", "source_of_funds":"SALARY",
    "tax_residency":"INDIA_ONLY", "us_person":"NO", "pep_status":"NO"}
VERIFICATION = {"verification_checks":["document_authenticity","pan_or_form60","identity_match","screening","declarations"],
    "verification_reference":"TEST-ONLY-BANK-VERIFICATION", "override_justification":"Test officer reviewed synthetic evidence using the isolated fixture"}


def synthetic_image():
    out=io.BytesIO();Image.new('RGB',(240,160),'white').save(out,format='PNG')
    return base64.b64encode(out.getvalue()).decode()


def kyc_draft(client, headers, customer_name="Aarav Mehta", update_type="INITIAL_KYC"):
    from dev_ui import workflow_service
    w=client.post('/api/ai/workflows',headers=headers,json={"skill_id":"kyc"}).json()
    fields={**KYC_FIELDS,"full_name":customer_name,"update_type":update_type}
    w=client.patch('/api/ai/workflows/'+w['id'],headers=headers,json={"revision":w['revision'],"fields":fields}).json()
    for kind in ('PAN','PASSPORT'):
        with patch.object(workflow_service.scanner,'scan',return_value={"status":"TEXT_EXTRACTED","text":"SYNTHETIC TEST DATA", "quality_score":0.95,"provider":"TEST_OCR"}):
            r=client.post('/api/ai/workflows/'+w['id']+'/documents',headers=headers,json={"revision":w['revision'],"document_type":kind,
                "name":"synthetic.png","mime_type":"image/png","data_base64":synthetic_image(),"consent":True})
            if r.status_code!=200: raise AssertionError(r.text)
            w=r.json()
    r=client.post('/api/ai/workflows/'+w['id']+'/review',headers=headers,json={"revision":w['revision'],"fields":{}})
    if r.status_code!=200: raise AssertionError(r.text)
    return r.json()


def submit_kyc(client, headers, **kwargs):
    w=kyc_draft(client,headers,**kwargs)
    from dev_ui import COOKIE_NAME, auth_service
    auth_service.elevate_session(client.cookies.get(COOKIE_NAME), "L3")  # stands in for Firebase re-authentication
    r=client.post('/api/ai/workflows/'+w['id']+'/submit',headers=headers,json={"revision":w['revision'],"review_digest":w['review_digest'],"confirmed":True})
    if r.status_code!=200: raise AssertionError(r.text)
    return r.json()
