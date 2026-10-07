---
id: objfile.lending
type: object-group
name: Lending objects
version: 0.1.0
status: draft
---
# Lending objects

Credit applications, loans and their repayment.

Each object lists its key attributes, lifecycle states, links to other objects (edges) and the database tables that currently back it. Personal-data sensitivity follows [Consent and Privacy](../policies/consent-and-privacy.md).

<a id="obj.loan_application"></a>
## Loan Application
`obj.loan_application`

A request for credit with applicants, income, obligations, decisions and stage history.

- **Key attributes:** `application_no`, `loan_product`, `requested_amount_minor`, `requested_tenure_months`, `stage`, `status`, `decided_at`
- **Lifecycle:** draft, submitted, kyc, documents, credit_check, underwriting, approved, sanctioned, disbursed, rejected, withdrawn
- **Personal data:** high
- **Backing tables:** `los_applications`, `los_applicants`, `los_applicant_obligations`, `los_underwriting_decisions`, `los_application_events`, `los_application_documents`
- **Links:**
  - `SUBMITTED_BY` [Customer](customer.md#obj.customer)
  - `HAS` [Credit Report](lending.md#obj.credit_report)
  - `SECURED_BY` [Collateral](lending.md#obj.collateral)
  - `BECOMES` [Loan](lending.md#obj.loan)
  - `STARTED_FROM` [Lead and Opportunity](engagement.md#obj.lead_opportunity)
- **Used in processes:** [Loan Origination](../processes/loan-origination.md)

<a id="obj.credit_report"></a>
## Credit Report
`obj.credit_report`

Bureau score and summary pulled with consent. Reusable only until expiry.

- **Key attributes:** `bureau`, `score`, `active_accounts`, `max_dpd_12m`, `pulled_at`, `expires_at`
- **Lifecycle:** valid, expired
- **Personal data:** high
- **Backing tables:** `los_credit_reports`
- **Links:**
  - `PULLED_UNDER` [Consent](customer.md#obj.consent)
- **Used in processes:** [Loan Origination](../processes/loan-origination.md)

<a id="obj.collateral"></a>
## Collateral
`obj.collateral`

An asset offered as security, with valuation and lien status.

- **Key attributes:** `collateral_type`, `market_value_minor`, `ltv_pct`, `lien_status`
- **Lifecycle:** proposed, registered, released
- **Personal data:** medium
- **Backing tables:** `los_collaterals`
- **Links:**
  - `SECURES` [Loan Application](lending.md#obj.loan_application)
- **Used in processes:** [Loan Origination](../processes/loan-origination.md)

<a id="obj.loan"></a>
## Loan
`obj.loan`

A sanctioned and disbursed credit facility: sanction terms, disbursements and loan account.

- **Key attributes:** `loan_account_no`, `principal_minor`, `outstanding_principal_minor`, `interest_rate_pct`, `emi_minor`, `dpd`, `asset_class`, `status`
- **Lifecycle:** active, closed, foreclosed, written_off
- **Personal data:** high
- **Backing tables:** `los_sanctions`, `los_loan_accounts`, `los_disbursements`
- **Links:**
  - `OWED_BY` [Customer](customer.md#obj.customer)
  - `REPAID_BY` [Repayment](lending.md#obj.repayment)
  - `MAY_HAVE` [Collections Case](lending.md#obj.collections_case)
- **Used in processes:** [Loan Origination](../processes/loan-origination.md), [Collections](../processes/collections.md)

<a id="obj.repayment"></a>
## Repayment
`obj.repayment`

A scheduled instalment and the receipts allocated to it.

- **Key attributes:** `installment_no`, `due_date`, `total_due_minor`, `status`, `allocated_principal_minor`, `allocated_interest_minor`
- **Lifecycle:** upcoming, due, partial, paid, overdue
- **Personal data:** medium
- **Backing tables:** `los_repayment_schedules`, `los_repayments`
- **Links:**
  - `INSTALMENT_OF` [Loan](lending.md#obj.loan)
  - `RECEIVED_AS` [Transaction](accounts-payments.md#obj.transaction)
- **Used in processes:** [Loan Origination](../processes/loan-origination.md), [Collections](../processes/collections.md), [Daily Close (EOD)](../processes/daily-close-eod.md)

<a id="obj.collections_case"></a>
## Collections Case
`obj.collections_case`

Delinquency follow-up for an overdue loan.

- **Key attributes:** `dpd_bucket`, `overdue_amount_minor`, `status`, `promise_date`, `promise_amount_minor`
- **Lifecycle:** open, promise_to_pay, restructured, legal, closed
- **Personal data:** high
- **Backing tables:** `los_collections_cases`
- **Links:**
  - `CHASES` [Loan](lending.md#obj.loan)
  - `TRACKED_AS` [Case](service-and-risk.md#obj.case) (service case for conduct trail)
- **Used in processes:** [Collections](../processes/collections.md)
