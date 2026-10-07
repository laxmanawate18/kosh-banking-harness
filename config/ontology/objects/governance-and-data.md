---
id: objfile.governance
type: object-group
name: Governance and data objects
version: 0.1.0
status: draft
---
# Governance and data objects

Approvals, models, audit evidence and the data estate.

Each object lists its key attributes, lifecycle states, links to other objects (edges) and the database tables that currently back it. Personal-data sensitivity follows [Consent and Privacy](../policies/consent-and-privacy.md).

<a id="obj.approval_request"></a>
## Approval Request
`obj.approval_request`

A request for human approval of an agent action, with the evidence package and decision.

- **Key attributes:** `request_id`, `service_id`, `status`, `findings`, `discrepancy_flags`, `approver_id`, `resolution_reason`
- **Lifecycle:** pending, approved, rejected, expired
- **Personal data:** medium
- **Backing tables:** `service_requests`, `approval_actions`, `banking_workflows`
- **Links:**
  - `DECIDED_BY` [Relationship Manager](engagement.md#obj.relationship_manager) (or other approver per matrix)
- **Used in processes:** [Agent Action Approval](../processes/agent-action-approval.md)

<a id="obj.policy_rule"></a>
## Policy Rule
`obj.policy_rule`

A versioned rule that an activity is governed by. Files in policies/ are the human-readable form.

- **Key attributes:** `policy_version`, `scope`, `owner`, `effective_from`
- **Lifecycle:** draft, approved, deprecated
- **Personal data:** none
- **Backing tables:** `bank_sentinel_decisions`, `audit_events`
- **Links:**
  - `GOVERNS` [Approval Request](governance-and-data.md#obj.approval_request)
- **Used in processes:** [Agent Action Approval](../processes/agent-action-approval.md)

<a id="obj.model"></a>
## Model
`obj.model`

A registered AI or statistical model with approved use cases and evaluation summary.

- **Key attributes:** `model_name`, `version`, `approved_use_cases`, `evaluation_summary`, `active`
- **Lifecycle:** proposed, validated, approved, deployed, retired
- **Personal data:** none
- **Backing tables:** `model_registry`, `dl_model_scores`
- **Links:**
  - `SCORES` [Customer](customer.md#obj.customer) (via score store)
- **Used in processes:** [Model Lifecycle](../processes/model-lifecycle.md)

<a id="obj.audit_event"></a>
## Audit Event
`obj.audit_event`

An immutable, hash-chained record of what an actor did, under which policy, model and consent.

- **Key attributes:** `event_type`, `service_id`, `actor`, `model_version`, `policy_version`, `consent_id`, `approver_id`, `severity`, `integrity_hash`
- **Lifecycle:** sealed
- **Personal data:** medium
- **Backing tables:** `audit_events`, `bank_audit_log`
- **Links:**
  - `RECORDS` [Approval Request](governance-and-data.md#obj.approval_request)
- **Used in processes:** [Agent Action Approval](../processes/agent-action-approval.md)

<a id="obj.agent_delegation"></a>
## Agent Delegation
`obj.agent_delegation`

A customer's grant to an AI agent to act on their behalf, with scope and status.

- **Key attributes:** `agent_id`, `status`, `scope`
- **Lifecycle:** active, revoked, expired
- **Personal data:** medium
- **Backing tables:** `bank_delegations`
- **Links:**
  - `GRANTED_BY` [Customer](customer.md#obj.customer)
- **Used in processes:** [Payment Authorisation](../processes/payment-authorisation.md)

<a id="obj.dataset"></a>
## Dataset
`obj.dataset`

A catalogued data asset with zone, classification, PII tags, lineage and quality rules.

- **Key attributes:** `zone`, `classification`, `retention_days`, `owner_team`, `pii_columns`
- **Lifecycle:** draft, published, deprecated
- **Personal data:** none
- **Backing tables:** `dl_datasets`, `dl_dataset_columns`, `dl_lineage_edges`, `dl_dq_rules`, `dl_dq_results`, `dl_access_grants`
- **Links:**
  - `FEEDS` [Regulatory Report](governance-and-data.md#obj.regulatory_report)
  - `DERIVED_FROM` [Dataset](governance-and-data.md#obj.dataset) (lineage)
- **Used in processes:** [Regulatory Reporting](../processes/regulatory-reporting.md), [Model Lifecycle](../processes/model-lifecycle.md), [Data Subject Request](../processes/data-subject-request.md), [Data Product Publication](../processes/data-product-publication.md)

<a id="obj.regulatory_report"></a>
## Regulatory Report
`obj.regulatory_report`

A periodic regulator submission with validation, review and acknowledgement.

- **Key attributes:** `report_code`, `regulator`, `period_start`, `period_end`, `status`, `acknowledgement_ref`
- **Lifecycle:** draft, validated, submitted, accepted, rejected
- **Personal data:** none
- **Backing tables:** `dl_regulatory_reports`
- **Links:**
  - `BUILT_FROM` [Dataset](governance-and-data.md#obj.dataset)
- **Used in processes:** [Regulatory Reporting](../processes/regulatory-reporting.md)

<a id="obj.data_subject_request"></a>
## Data Subject Request
`obj.data_subject_request`

A customer's request to access, correct or delete personal data. No table exists yet (gap).

- **Key attributes:** `request_type`, `status`, `legal_basis_decision`, `due_date`
- **Lifecycle:** received, verified, in_review, applied, closed
- **Personal data:** high
- **Backing tables:** `(none yet - add dl or privacy table)`
- **Links:**
  - `MADE_BY` [Customer](customer.md#obj.customer)
- **Used in processes:** [Data Subject Request](../processes/data-subject-request.md)
