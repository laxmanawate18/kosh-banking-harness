from typing import List
from rpa.models import SelectorStrategy, StepAction, StepDefinition


def load_account_opening_graph(cbs_url: str = "") -> List[StepDefinition]:
    nav_url = f"{cbs_url}/cbs/retail/account_opening" if cbs_url else "/cbs/retail/account_opening"
    return [
        StepDefinition(
            step_id="AO-001",
            action=StepAction.NAVIGATE,
            screen_name="cbs_home",
            expected_value=nav_url,
            is_state_changing=False,
        ),
        StepDefinition(
            step_id="AO-002",
            action=StepAction.TYPE,
            screen_name="cbs_customer_info",
            field_key="txtCustName",
            target={
                "primary": SelectorStrategy(strategy="id", value="txtCustName"),
                "fallback_1": SelectorStrategy(strategy="name", value="customerName"),
                "fallback_2": SelectorStrategy(strategy="label_text", value="Customer Name"),
            },
        ),
        StepDefinition(
            step_id="AO-003",
            action=StepAction.TYPE,
            screen_name="cbs_customer_info",
            field_key="txtPanNo",
            target={
                "primary": SelectorStrategy(strategy="id", value="txtPanNo"),
                "fallback_1": SelectorStrategy(strategy="name", value="panNumber"),
                "fallback_2": SelectorStrategy(strategy="label_text", value="Permanent Account Number"),
            },
        ),
        StepDefinition(
            step_id="AO-004",
            action=StepAction.TYPE,
            screen_name="cbs_customer_info",
            field_key="txtDob",
            target={
                "primary": SelectorStrategy(strategy="id", value="txtDob"),
                "fallback_1": SelectorStrategy(strategy="name", value="dateOfBirth"),
                "fallback_2": SelectorStrategy(strategy="label_text", value="Date of Birth (DD/MM/YYYY)"),
            },
        ),
        StepDefinition(
            step_id="AO-005",
            action=StepAction.TYPE,
            screen_name="cbs_customer_info",
            field_key="txtMobile",
            target={
                "primary": SelectorStrategy(strategy="id", value="txtMobile"),
                "fallback_1": SelectorStrategy(strategy="name", value="mobileNumber"),
                "fallback_2": SelectorStrategy(strategy="label_text", value="Mobile Number"),
            },
        ),
        StepDefinition(
            step_id="AO-006",
            action=StepAction.TYPE,
            screen_name="cbs_customer_info",
            field_key="txtAddress",
            target={
                "primary": SelectorStrategy(strategy="id", value="txtAddress"),
                "fallback_1": SelectorStrategy(strategy="name", value="residentialAddress"),
                "fallback_2": SelectorStrategy(strategy="label_text", value="Address"),
            },
        ),
        StepDefinition(
            step_id="AO-007",
            action=StepAction.SELECT_OPTION,
            screen_name="cbs_account_scheme",
            field_key="ddlAcctType",
            target={
                "primary": SelectorStrategy(strategy="id", value="ddlAcctType"),
                "fallback_1": SelectorStrategy(strategy="name", value="schemeCode"),
            },
        ),
        StepDefinition(
            step_id="AO-008",
            action=StepAction.TYPE,
            screen_name="cbs_account_scheme",
            field_key="txtExtRef",
            target={
                "primary": SelectorStrategy(strategy="id", value="txtExtRef"),
                "fallback_1": SelectorStrategy(strategy="name", value="portalReference"),
                "fallback_2": SelectorStrategy(strategy="label_text", value="Application Reference"),
            },
        ),
        StepDefinition(
            step_id="AO-009",
            action=StepAction.READ_BACK,
            screen_name="cbs_account_scheme",
            is_state_changing=False,
        ),
        StepDefinition(
            step_id="AO-010",
            action=StepAction.SUBMIT,
            screen_name="cbs_account_scheme",
            target={
                "primary": SelectorStrategy(strategy="id", value="btnSubmitMaker"),
                "fallback_1": SelectorStrategy(strategy="css", value="button[type='submit']"),
                "fallback_2": SelectorStrategy(strategy="label_text", value="Submit for Verification"),
            },
            can_retry_on_failure=False,  # CRITICAL: Never auto-retry submit
        ),
    ]
