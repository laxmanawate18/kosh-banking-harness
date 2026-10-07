---
id: act.open_case
type: activity
name: Open Case
version: 0.1.0
status: draft
skill_id: act.open_case
performed_by: [actor.service_agent, actor.fraud_agent, actor.collections_agent, actor.insurance_agent]
approval_gate: none
approval_when: n/a
autonomy: A3
governed_by: [pol.agent_guardrails, pol.audit_evidence]
reads: [obj.customer, obj.interaction]
writes: [obj.case]
evidence: [case.opened]
---
# Open Case

> Create and classify a case with owner, priority and SLA deadline.

## Inputs
- customer
- request or complaint text
- channel

## Outputs
- case id
- category, priority, due date, owner

## Rules
- A complaint MUST be flagged as a complaint so regulatory turnaround times apply.
- Vulnerability indicators MUST raise priority and notify a human.

## If it fails
If classification is uncertain, open as 'general' with high priority for human triage rather than guessing.

## Authority
- **Autonomy:** A3 (Act within limits). Agent executes alone inside policy limits and parameters; every action is audited; anything outside limits escalates.
- **Approval gate:** none
- **May be performed by:** [Service Agent](../actors/agents.md#actor.service_agent), [Fraud Triage Agent](../actors/agents.md#actor.fraud_agent), [Collections Agent](../actors/agents.md#actor.collections_agent), [Insurance Agent](../actors/agents.md#actor.insurance_agent)
- **Governed by:** [Agent Guardrails](../policies/agent-guardrails.md), [Audit and Evidence](../policies/audit-and-evidence.md)

## Data
- **Reads:** [Customer](../objects/customer.md#obj.customer), [Interaction](../objects/engagement.md#obj.interaction)
- **Writes:** [Case](../objects/service-and-risk.md#obj.case)
- **Backing tables:** `care_cases`, `crm_case_comments`

## Evidence
Emit: `case.opened`. Shape and rules: [Audit and Evidence](../policies/audit-and-evidence.md).

## Used by
- [Service Case (Control Tower)](../processes/service-case.md), step "Classify"
- [Collections](../processes/collections.md), step "Contact"
- [Fraud and Dispute](../processes/fraud-and-dispute.md), step "Raise Dispute"
- [Claim Assistance](../processes/claim-assistance.md), step "Track"
