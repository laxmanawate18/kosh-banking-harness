---
id: actorfile.humans
type: actor-group
name: Human Roles, External Parties and Systems
version: 0.1.0
status: draft
---
# Human Roles, External Parties and Systems

Humans decide what agents may not. External parties and systems act inside processes but are not controlled by the bank's agents.

<a id="actor.compliance_officer"></a>
## Compliance Officer
`actor.compliance_officer` (human)

Decides on screening hits, high-risk onboarding and policy exceptions.

- **Approves or decides at:**
  - [Account Opening](../processes/account-opening.md), step "Check Compliance"
  - [Perpetual KYC](../processes/perpetual-kyc.md), step "Officer Review"
  - [Regulatory Reporting](../processes/regulatory-reporting.md), step "Submit"
  - [Verify Identity](../activities/verify-identity.md) (activity gate)
  - [Screen Sanctions and PEP](../activities/screen-sanctions-pep.md) (activity gate)
  - [Risk-Rate Customer](../activities/risk-rate-customer.md) (activity gate)

<a id="actor.mlro"></a>
## Money Laundering Reporting Officer
`actor.mlro` (human)

Owns suspicious-transaction decisions and filings.

- **Approves or decides at:**
  - [AML Alert Investigation](../processes/aml-alert-investigation.md), step "File STR"

<a id="actor.aml_investigator"></a>
## AML Investigator
`actor.aml_investigator` (human)

Investigates and dispositions AML alerts.

- **Approves or decides at:**
  - [AML Alert Investigation](../processes/aml-alert-investigation.md), step "Decide"
- **Escalates to:** [Money Laundering Reporting Officer](humans-and-external.md#actor.mlro)

<a id="actor.credit_officer"></a>
## Credit Officer
`actor.credit_officer` (human)

Approves referrals, overrides and sanctions beyond agent authority.

- **Approves or decides at:**
  - [Loan Origination](../processes/loan-origination.md), step "Underwrite"
  - [Loan Origination](../processes/loan-origination.md), step "Disburse"

<a id="actor.relationship_manager"></a>
## Relationship Manager
`actor.relationship_manager` (human)

Owns the personal relationship; approves concessions and handles vulnerable customers.

- **Approves or decides at:**
  - [Next Best Offer](../processes/next-best-offer.md), step "Check Eligibility and Suitability"
  - [Churn Retention](../processes/churn-retention.md), step "Assign RM"
  - [Churn Retention](../processes/churn-retention.md), step "Make Retention Offer"
  - [Agent Action Approval](../processes/agent-action-approval.md), step "Approve or Reject"
  - [Check Eligibility and Suitability](../activities/check-eligibility-suitability.md) (activity gate)

<a id="actor.service_officer"></a>
## Service Officer
`actor.service_officer` (human)

Handles complex, sensitive or out-of-authority service matters.

- **Approves or decides at:**
  - [Collect Documents](../activities/collect-documents.md) (activity gate)

<a id="actor.fraud_analyst"></a>
## Fraud Analyst
`actor.fraud_analyst` (human)

Decides fraud disputes and provisional credits.

- **Approves or decides at:**
  - [Fraud and Dispute](../processes/fraud-and-dispute.md), step "Provisional Credit"
  - [Fraud and Dispute](../processes/fraud-and-dispute.md), step "Investigate"
  - [Score Transaction Risk](../activities/score-transaction-risk.md) (activity gate)
  - [Validate Beneficiary](../activities/validate-beneficiary.md) (activity gate)

<a id="actor.collections_officer"></a>
## Collections Officer
`actor.collections_officer` (human)

Approves restructures and legal escalation.

- **Approves or decides at:**
  - [Collections](../processes/collections.md), step "Offer Restructure"
  - [Collections](../processes/collections.md), step "Escalate"

<a id="actor.operations_officer"></a>
## Operations Officer
`actor.operations_officer` (human)

Owns end-of-day completion and operational breaks.

- **Approves or decides at:** none directly

<a id="actor.finance_ops"></a>
## Finance Operations
`actor.finance_ops` (human)

Owns reconciliation breaks, period close and report sign-off.

- **Approves or decides at:**
  - [Daily Close (EOD)](../processes/daily-close-eod.md), step "Reconcile"
  - [Regulatory Reporting](../processes/regulatory-reporting.md), step "Review"
  - [Post to Ledger](../activities/post-to-ledger.md) (activity gate)
  - [Reconcile](../activities/reconcile.md) (activity gate)

<a id="actor.privacy_officer"></a>
## Privacy Officer
`actor.privacy_officer` (human)

Decides data-subject requests and retention conflicts.

- **Approves or decides at:**
  - [Data Subject Request](../processes/data-subject-request.md), step "Assess Legal Basis and Retention Holds"

<a id="actor.model_risk_officer"></a>
## Model Risk Officer
`actor.model_risk_officer` (human)

Approves, restricts and retires models.

- **Approves or decides at:**
  - [Model Lifecycle](../processes/model-lifecycle.md), step "Approve"

<a id="actor.data_steward"></a>
## Data Steward
`actor.data_steward` (human)

Owns dataset classification and access grants.

- **Approves or decides at:**
  - [Data Product Publication](../processes/data-product-publication.md), step "Grant Access"
  - [Check Data Quality](../activities/check-data-quality.md) (activity gate)

<a id="actor.licensed_advisor"></a>
## Licensed Insurance Advisor
`actor.licensed_advisor` (human)

Regulated person for insurance advice and suitability sign-off.

- **Approves or decides at:**
  - [Insurance Sale](../processes/insurance-sale.md), step "Needs Analysis"

<a id="actor.customer"></a>
## Customer
`actor.customer` (external)

Initiates requests, gives consent, completes authentication challenges.

- **Approves or decides at:** none directly

<a id="actor.insurer"></a>
## Partner Insurer
`actor.insurer` (external)

Underwrites, issues policies and settles claims.

- **Approves or decides at:** none directly

<a id="actor.system_batch"></a>
## Batch / Posting Engine
`actor.system_batch` (system)

Deterministic jobs and the ledger posting engine. Not an AI agent.

- **Approves or decides at:** none directly
