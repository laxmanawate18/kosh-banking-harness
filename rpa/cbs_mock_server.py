from html import escape

from fastapi import APIRouter, FastAPI, Form
from fastapi.responses import HTMLResponse

mock_cbs_app = FastAPI(title="Mock CBS Retail Core Banking System")
cbs_router = APIRouter()
submitted_records = []
MAX_KEPT = 500  # this page is public on the deployed app: keep memory bounded
_submitted_total = 0


@cbs_router.get("/cbs/retail/account_opening", response_class=HTMLResponse)
async def get_ao_form():
    return """
    <!DOCTYPE html>
    <html>
    <head><title>CBS Account Opening Form - Maker</title></head>
    <body style="font-family: sans-serif; padding: 20px;">
        <h2>Finacle Core Banking System - Retail Account Opening (Maker Entry)</h2>
        <form id="cbsAoForm" action="/cbs/retail/submit" method="post">
            <div style="margin-bottom: 10px;">
                <label for="txtCustName">Customer Name</label><br/>
                <input id="txtCustName" name="customerName" required style="width: 300px;" />
            </div>
            <div style="margin-bottom: 10px;">
                <label for="txtPanNo">Permanent Account Number</label><br/>
                <input id="txtPanNo" name="panNumber" required style="width: 300px;" />
            </div>
            <div style="margin-bottom: 10px;">
                <label for="txtDob">Date of Birth (DD/MM/YYYY)</label><br/>
                <input id="txtDob" name="dateOfBirth" required style="width: 300px;" />
            </div>
            <div style="margin-bottom: 10px;">
                <label for="txtMobile">Mobile Number</label><br/>
                <input id="txtMobile" name="mobileNumber" required style="width: 300px;" />
            </div>
            <div style="margin-bottom: 10px;">
                <label for="txtAddress">Address</label><br/>
                <input id="txtAddress" name="residentialAddress" required style="width: 300px;" />
            </div>
            <div style="margin-bottom: 10px;">
                <label for="ddlAcctType">Scheme Code</label><br/>
                <select id="ddlAcctType" name="schemeCode" style="width: 300px;">
                    <option value="SB_GEN_IND">Savings Individual (SB_GEN_IND)</option>
                    <option value="SB_SAL_IND">Salary Privilege (SB_SAL_IND)</option>
                    <option value="CA_GEN_IND">Current Individual (CA_GEN_IND)</option>
                </select>
            </div>
            <div style="margin-bottom: 10px;">
                <label for="txtExtRef">Application Reference</label><br/>
                <input id="txtExtRef" name="portalReference" required style="width: 300px;" />
            </div>
            <button id="btnSubmitMaker" type="submit" style="padding: 8px 16px; background: #006b5e; color: white; border: none; border-radius: 4px;">
                Submit for Verification
            </button>
        </form>
    </body>
    </html>
    """


@cbs_router.post("/cbs/retail/submit", response_class=HTMLResponse)
async def submit_ao_form(
    customerName: str = Form(...),
    panNumber: str = Form(...),
    portalReference: str = Form(...),
):
    global _submitted_total
    cif = f"CIF-{_submitted_total + 5001}"
    acct = f"1092{_submitted_total + 4821:06d}"
    _submitted_total += 1
    record = {
        "cif": cif,
        "accountNumber": acct,
        "customerName": customerName,
        "panNumber": panNumber,
        "portalReference": portalReference,
    }
    submitted_records.append(record)
    del submitted_records[:-MAX_KEPT]
    return f"""
    <!DOCTYPE html>
    <html>
        <body style="font-family: sans-serif; padding: 20px;">
            <div id="confirmationBanner">
                <h2>Record Successfully Submitted to Checker Queue</h2>
                <p>Generated CIF: <strong id="lblCifNumber">{cif}</strong></p>
                <p>Generated Account: <strong id="lblAcctNumber">{acct}</strong></p>
                <p>Application Ref: <span id="lblRef">{escape(portalReference)}</span></p>
                <p>CBS Status: <span id="lblCbsStatus">PENDING_CHECKER_APPROVAL</span></p>
            </div>
        </body>
    </html>
    """


mock_cbs_app.include_router(cbs_router)
