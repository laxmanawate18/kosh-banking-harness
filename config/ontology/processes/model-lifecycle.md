---
id: proc.model_lifecycle
type: process
name: Model Lifecycle
domain: governance-ai
version: 0.1.0
status: draft
performed_by: actor.governance_agent
escalates_to: [actor.model_risk_officer]
triggered_by: [evt.model_change_proposed]
emits: []
uses_activities: [act.route_to_approver]
governed_by: [pol.approval_matrix, pol.audit_evidence, pol.agent_guardrails]
reads: [obj.model, obj.dataset]
writes: [obj.model]
kosh_status: partial
kosh_channels: [officer]
kosh_tools: []
kosh_skills: []
kosh_care: []
kosh_services: []
kosh_tables: [model_registry, mitra_turns, chat_feedback]
kosh_note: Prompt and model versions are evaluated and approved in the officer console (Operations, Mitra quality); the copilot cannot approve them.
---
# Model Lifecycle

> Takes a model from proposal through validation, approval, deployment, monitoring and retirement.

## Use this process when
- new model
- model approval
- model drift
- retire a model
- model monitoring

## Do not use it when
- agent action approval: use [Agent Action Approval](agent-action-approval.md)

## Trigger and ownership
- **Triggered by:** [Model change proposed](../events.md#evt.model_change_proposed)
- **Performed by:** [Governance Agent](../actors/agents.md#actor.governance_agent) (autonomy ceiling A1)
- **Escalates to:** [Model Risk Officer](../actors/humans-and-external.md#actor.model_risk_officer)
- **Emits:** none
- **Governed by:** [Approval Matrix](../policies/approval-matrix.md), [Audit and Evidence](../policies/audit-and-evidence.md), [Agent Guardrails](../policies/agent-guardrails.md)

## Flow
Work the steps in order. At each step, open the linked activity file before acting. A step marked conditional is skipped when its condition is false, and the skip is recorded.

| # | Step | Edge | Activities | Performed by | Approval gate | Autonomy | Condition | What happens |
|---|---|---|---|---|---|---|---|---|
| 1 | **Propose** | START | inline | [Governance Agent](../actors/agents.md#actor.governance_agent) | none | A3 | always | Register the model, version, intended use and data. |
| 2 | **Validate** | ACTIVITY | inline | [Governance Agent](../actors/agents.md#actor.governance_agent) | none | A1 | always | Evaluate performance, fairness and robustness. Attach the evaluation summary. |
| 3 | **Approve** | ACTIVITY | [Route to Approver](../activities/route-to-approver.md) | [Governance Agent](../actors/agents.md#actor.governance_agent) | [Model Risk Officer](../actors/humans-and-external.md#actor.model_risk_officer) (always) | A2 | always | Approve with a list of approved use cases. |
| 4 | **Deploy** | ACTIVITY | inline | [Governance Agent](../actors/agents.md#actor.governance_agent) | none | A3 | always | Deploy and mark active in the model registry. |
| 5 | **Monitor** | ACTIVITY | inline | [Governance Agent](../actors/agents.md#actor.governance_agent) | none | A1 | always | Watch drift, performance and fairness. Alert owners on breach. |
| 6 | **Retire** | FINALIZE | inline | [Governance Agent](../actors/agents.md#actor.governance_agent) | none | A3 | always | Retire the model and stop scoring. |

## Graph edges
`proc.model_lifecycle` is the hub. Edges follow the hub-and-spoke pattern: the hub STARTs the first step, has an ACTIVITY edge to each middle step, FINALIZEs the last, and steps chain with NEXT.

```mermaid
graph LR
  H(("Model Lifecycle"))
  S1["Propose"]
  S2["Validate"]
  S3["Approve"]
  S4["Deploy"]
  S5["Monitor"]
  S6["Retire"]
  H -- START --> S1
  H -- ACTIVITY --> S2
  H -- ACTIVITY --> S3
  H -- ACTIVITY --> S4
  H -- ACTIVITY --> S5
  H -- FINALIZE --> S6
  S1 -- NEXT --> S2
  S2 -- NEXT --> S3
  S3 -- NEXT --> S4
  S4 -- NEXT --> S5
  S5 -- NEXT --> S6
```

## Exceptions
| If | Then |
|---|---|
| Drift or fairness breach | Alert the model risk officer and restrict use to approved fallbacks. |
| Use outside approved use cases | Block the use and report. |

## Finalize (done means)
Model status in the registry matches reality and every change is evidenced.

## Data touched
| Object | Access | Backing tables |
|---|---|---|
| [Model](../objects/governance-and-data.md#obj.model) | reads and writes | `model_registry`, `dl_model_scores` |
| [Dataset](../objects/governance-and-data.md#obj.dataset) | reads | `dl_datasets`, `dl_dataset_columns`, `dl_lineage_edges`, `dl_dq_rules`, `dl_dq_results`, `dl_access_grants` |

## Evidence emitted
Event types from the activities above (see [Audit and Evidence](../policies/audit-and-evidence.md)): `approval.requested`, `approval.approved`, `approval.rejected`, `approval.expired`.

## Related
- Related processes: [Agent Action Approval](agent-action-approval.md)
- Routing and event map: [routing.md](../routing.md)
