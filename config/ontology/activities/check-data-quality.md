---
id: act.check_data_quality
type: activity
name: Check Data Quality
version: 0.1.0
status: draft
skill_id: act.check_data_quality
performed_by: [actor.data_agent, actor.reporting_agent]
approval_gate: actor.data_steward
approval_when: a critical rule fails
autonomy: A3
governed_by: [pol.audit_evidence]
reads: [obj.dataset]
writes: [obj.dataset]
evidence: [dq.evaluated]
---
# Check Data Quality

> Run data-quality rules on a dataset and report pass or fail by severity.

## Inputs
- dataset
- rules to run

## Outputs
- pass rate per rule
- overall pass or fail

## Rules
- Critical failures MUST block downstream use.
- Failure samples MUST be masked.

## If it fails
A critical rule failure blocks publishing or submission. Warnings are reported and allowed to proceed with a note.

## Authority
- **Autonomy:** A3 (Act within limits). Agent executes alone inside policy limits and parameters; every action is audited; anything outside limits escalates.
- **Approval gate:** [Data Steward](../actors/humans-and-external.md#actor.data_steward) only when a critical rule fails
- **May be performed by:** [Data Agent](../actors/agents.md#actor.data_agent), [Reporting Agent](../actors/agents.md#actor.reporting_agent)
- **Governed by:** [Audit and Evidence](../policies/audit-and-evidence.md)

## Data
- **Reads:** [Dataset](../objects/governance-and-data.md#obj.dataset)
- **Writes:** [Dataset](../objects/governance-and-data.md#obj.dataset)
- **Backing tables:** `dl_dq_rules`, `dl_dq_results`

## Evidence
Emit: `dq.evaluated`. Shape and rules: [Audit and Evidence](../policies/audit-and-evidence.md).

## Used by
- [Regulatory Reporting](../processes/regulatory-reporting.md), step "Validate Data Quality"
- [Data Product Publication](../processes/data-product-publication.md), step "Check Data Quality"
