---
id: objfile.service
type: object-group
name: Service and risk objects
version: 0.1.0
status: draft
---
# Service and risk objects

Cases, disputes and alerts that need ownership and a deadline.

Each object lists its key attributes, lifecycle states, links to other objects (edges) and the database tables that currently back it. Personal-data sensitivity follows [Consent and Privacy](../policies/consent-and-privacy.md).

<a id="obj.case"></a>
## Case
`obj.case`

A service request or complaint with owner, priority, SLA and root cause.

- **Key attributes:** `case_id`, `kind`, `category`, `priority`, `status`, `due_at`, `assigned_to`, `resolved_at`, `root_cause_code`
- **Lifecycle:** open, in_progress, pending_customer, escalated, resolved, closed
- **Personal data:** medium
- **Backing tables:** `care_cases`, `crm_case_comments`
- **Links:**
  - `RAISED_BY` [Customer](customer.md#obj.customer)
  - `OWNED_BY` [Relationship Manager](engagement.md#obj.relationship_manager) (or service officer)
  - `HAS` [Interaction](engagement.md#obj.interaction)
- **Used in processes:** [Churn Retention](../processes/churn-retention.md), [Service Case (Control Tower)](../processes/service-case.md), [Fraud and Dispute](../processes/fraud-and-dispute.md), [Claim Assistance](../processes/claim-assistance.md)

<a id="obj.dispute"></a>
## Dispute
`obj.dispute`

A disputed transaction (unauthorised, duplicate, not received, wrong amount) with turnaround deadline.

- **Key attributes:** `dispute_type`, `amount_minor`, `status`, `tat_due_date`, `network_ref`
- **Lifecycle:** raised, under_review, provisional_credit, won, lost, closed
- **Personal data:** high
- **Backing tables:** `ret_disputes`
- **Links:**
  - `DISPUTES` [Transaction](accounts-payments.md#obj.transaction)
  - `TRACKED_AS` [Case](service-and-risk.md#obj.case)
- **Used in processes:** [Fraud and Dispute](../processes/fraud-and-dispute.md)

<a id="obj.alert"></a>
## Alert
`obj.alert`

A monitoring alert: AML, sanctions, PEP, adverse media or card and account security.

- **Key attributes:** `alert_type`, `rule_code`, `score`, `severity`, `status`, `disposition`
- **Lifecycle:** open, under_review, escalated, closed_false_positive, str_filed
- **Personal data:** high
- **Backing tables:** `core_aml_alerts`, `bank_security_alerts`
- **Links:**
  - `ABOUT` [Customer](customer.md#obj.customer)
  - `TRIGGERED_BY` [Transaction](accounts-payments.md#obj.transaction)
- **Used in processes:** [Account Opening](../processes/account-opening.md), [Perpetual KYC](../processes/perpetual-kyc.md), [Fraud and Dispute](../processes/fraud-and-dispute.md), [AML Alert Investigation](../processes/aml-alert-investigation.md)
