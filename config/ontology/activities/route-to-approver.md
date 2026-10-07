---
id: act.route_to_approver
type: activity
name: Route to Approver
version: 0.1.0
status: draft
skill_id: act.route_to_approver
performed_by: [actor.governance_agent, actor.onboarding_agent, actor.kyc_agent, actor.lending_agent, actor.collections_agent, actor.insurance_agent, actor.reporting_agent, actor.retention_agent, actor.data_agent]
approval_gate: none
approval_when: n/a
autonomy: A2
governed_by: [pol.approval_matrix, pol.agent_guardrails, pol.audit_evidence]
reads: [obj.approval_request]
writes: [obj.approval_request]
evidence: [approval.requested, approval.approved, approval.rejected, approval.expired]
---
# Route to Approver

> Package the evidence, route to the approver named in the approval matrix, wait and record the decision with reasons.

## Inputs
- proposed action
- evidence package
- approver role from the matrix

## Outputs
- decision: approved, rejected or expired
- approver id and reason
- approval token

## Rules
- The approver MUST be a different identity from the requester.
- An override REQUIRES a written justification.
- An approval authorises exactly the action and scope in the request, nothing more.

## If it fails
No decision before the deadline: expire the request, notify the owner and do not proceed. Never auto-approve on timeout.

## Authority
- **Autonomy:** A2 (Act with approval). Agent executes only after a named approver has approved in this run.
- **Approval gate:** none
- **May be performed by:** [Governance Agent](../actors/agents.md#actor.governance_agent), [Onboarding Agent](../actors/agents.md#actor.onboarding_agent), [KYC Agent](../actors/agents.md#actor.kyc_agent), [Lending Agent](../actors/agents.md#actor.lending_agent), [Collections Agent](../actors/agents.md#actor.collections_agent), [Insurance Agent](../actors/agents.md#actor.insurance_agent), [Reporting Agent](../actors/agents.md#actor.reporting_agent), [Retention Agent](../actors/agents.md#actor.retention_agent), [Data Agent](../actors/agents.md#actor.data_agent)
- **Governed by:** [Approval Matrix](../policies/approval-matrix.md), [Agent Guardrails](../policies/agent-guardrails.md), [Audit and Evidence](../policies/audit-and-evidence.md)

## Data
- **Reads:** [Approval Request](../objects/governance-and-data.md#obj.approval_request)
- **Writes:** [Approval Request](../objects/governance-and-data.md#obj.approval_request)
- **Backing tables:** `service_requests`, `approval_actions`

## Evidence
Emit: `approval.requested`, `approval.approved`, `approval.rejected`, `approval.expired`. Shape and rules: [Audit and Evidence](../policies/audit-and-evidence.md).

## Used by
- [Perpetual KYC](../processes/perpetual-kyc.md), step "Officer Review"
- [Churn Retention](../processes/churn-retention.md), step "Assign RM"
- [Loan Origination](../processes/loan-origination.md), step "Underwrite"
- [Collections](../processes/collections.md), step "Offer Restructure"
- [Collections](../processes/collections.md), step "Escalate"
- [AML Alert Investigation](../processes/aml-alert-investigation.md), step "Decide"
- [AML Alert Investigation](../processes/aml-alert-investigation.md), step "File STR"
- [Regulatory Reporting](../processes/regulatory-reporting.md), step "Review"
- [Regulatory Reporting](../processes/regulatory-reporting.md), step "Submit"
- [Agent Action Approval](../processes/agent-action-approval.md), step "Route to Approver"
- [Model Lifecycle](../processes/model-lifecycle.md), step "Approve"
- [Data Subject Request](../processes/data-subject-request.md), step "Assess Legal Basis and Retention Holds"
- [Data Product Publication](../processes/data-product-publication.md), step "Grant Access"
