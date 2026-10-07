---
id: act.write_back_outcome
type: activity
name: Write Back Outcome
version: 0.1.0
status: draft
skill_id: act.write_back_outcome
performed_by: [actor.marketing_agent, actor.retention_agent, actor.service_agent, actor.collections_agent]
approval_gate: none
approval_when: n/a
autonomy: A3
governed_by: [pol.audit_evidence]
reads: [obj.interaction]
writes: [obj.interaction, obj.lead_opportunity, obj.case]
evidence: [outcome.recorded]
---
# Write Back Outcome

> Record what happened (response, decision, reason, resolution) back into the data so future decisions improve. This is the closed loop.

## Inputs
- action taken
- customer response or result
- reason code

## Outputs
- outcome record linked to the originating action

## Rules
- MUST use a controlled reason code, not free text only.
- A process is not finished until its outcome is written back.

## If it fails
If write-back fails, retry and alert operations. Do not close the process until the outcome is stored.

## Authority
- **Autonomy:** A3 (Act within limits). Agent executes alone inside policy limits and parameters; every action is audited; anything outside limits escalates.
- **Approval gate:** none
- **May be performed by:** [Marketing Agent](../actors/agents.md#actor.marketing_agent), [Retention Agent](../actors/agents.md#actor.retention_agent), [Service Agent](../actors/agents.md#actor.service_agent), [Collections Agent](../actors/agents.md#actor.collections_agent)
- **Governed by:** [Audit and Evidence](../policies/audit-and-evidence.md)

## Data
- **Reads:** [Interaction](../objects/engagement.md#obj.interaction)
- **Writes:** [Interaction](../objects/engagement.md#obj.interaction), [Lead and Opportunity](../objects/engagement.md#obj.lead_opportunity), [Case](../objects/service-and-risk.md#obj.case)
- **Backing tables:** `offer_events`, `crm_interactions`, `care_cases`, `cross_sell_leads`, `crm_opportunities`

## Evidence
Emit: `outcome.recorded`. Shape and rules: [Audit and Evidence](../policies/audit-and-evidence.md).

## Used by
- [Next Best Offer](../processes/next-best-offer.md), step "Capture Response"
- [Churn Retention](../processes/churn-retention.md), step "Log Outcome"
- [Service Case (Control Tower)](../processes/service-case.md), step "Record Root Cause"
- [Collections](../processes/collections.md), step "Regularise or Close"
