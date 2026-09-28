from datetime import datetime
from typing import Dict
from rpa.models import AccountApplicationSnapshot
from rpa.sanitizer import sanitize_field


def map_application_to_cbs(snapshot: AccountApplicationSnapshot) -> Dict[str, str]:
    # Parse YYYY-MM-DD to legacy CBS DD/MM/YYYY
    try:
        dt = datetime.strptime(snapshot.dob, "%Y-%m-%d")
        cbs_dob = dt.strftime("%d/%m/%Y")
    except Exception:
        cbs_dob = snapshot.dob

    scheme_map = {
        "SAVINGS_INDIVIDUAL": "SB_GEN_IND",
        "SALARY_PRIVILEGE": "SB_SAL_IND",
        "CURRENT_INDIVIDUAL": "CA_GEN_IND",
    }

    return {
        "txtCustName": sanitize_field(snapshot.customer_name, "name"),
        "txtPanNo": sanitize_field(snapshot.pan, "pan"),
        "txtAadhaarLast4": snapshot.aadhaar_last4,
        "txtDob": cbs_dob,
        "txtMobile": sanitize_field(snapshot.mobile, "mobile"),
        "txtEmail": snapshot.email.lower(),
        "txtAddress": sanitize_field(snapshot.address_line, "address"),
        "txtCity": sanitize_field(snapshot.city, "name"),
        "txtPin": sanitize_field(snapshot.pincode, "pincode"),
        "ddlAcctType": scheme_map.get(snapshot.account_type, "SB_GEN_IND"),
        "txtNominee": sanitize_field(snapshot.nominee_name or "", "name") if snapshot.nominee_name else "",
        "ddlNomineeRel": (snapshot.nominee_relationship or "OTHER").upper(),
        "txtExtRef": snapshot.application_reference,
    }
