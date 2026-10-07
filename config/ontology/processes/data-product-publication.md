---
id: proc.data_product_publication
type: process
name: Data Product Publication
domain: data-estate
version: 0.1.0
status: draft
performed_by: actor.data_agent
escalates_to: [actor.data_steward]
triggered_by: [evt.new_data_source]
emits: []
uses_activities: [act.check_data_quality, act.route_to_approver]
governed_by: [pol.consent_privacy, pol.audit_evidence, pol.approval_matrix]
reads: [obj.dataset]
writes: [obj.dataset]
kosh_status: not_implemented
kosh_channels: [officer]
kosh_tools: []
kosh_skills: []
kosh_care: []
kosh_services: []
kosh_tables: []
---
# Data Product Publication

> Brings a new source into the lake and publishes a governed, quality-checked dataset.

## Use this process when
- new data source
- publish a dataset
- onboard data
- ingest
- data pipeline

## Do not use it when
- regulatory report: use [Regulatory Reporting](regulatory-reporting.md)

## Trigger and ownership
- **Triggered by:** [New data source](../events.md#evt.new_data_source)
- **Performed by:** [Data Agent](../actors/agents.md#actor.data_agent) (autonomy ceiling A2)
- **Escalates to:** [Data Steward](../actors/humans-and-external.md#actor.data_steward)
- **Emits:** none
- **Governed by:** [Consent and Privacy](../policies/consent-and-privacy.md), [Audit and Evidence](../policies/audit-and-evidence.md), [Approval Matrix](../policies/approval-matrix.md)

## Flow
Work the steps in order. At each step, open the linked activity file before acting. A step marked conditional is skipped when its condition is false, and the skip is recorded.

| # | Step | Edge | Activities | Performed by | Approval gate | Autonomy | Condition | What happens |
|---|---|---|---|---|---|---|---|---|
| 1 | **Register Source** | START | inline | [Data Agent](../actors/agents.md#actor.data_agent) | none | A3 | always | Register the source, owner, refresh mode and whether it holds personal data. |
| 2 | **Ingest** | ACTIVITY | inline | [Data Agent](../actors/agents.md#actor.data_agent) | none | A3 | always | Ingest to the raw zone with run tracking. |
| 3 | **Check Data Quality** | ACTIVITY | [Check Data Quality](../activities/check-data-quality.md) | [Data Agent](../actors/agents.md#actor.data_agent) | none | A3 | always | Run quality rules and block on critical failure. |
| 4 | **Classify PII** | ACTIVITY | inline | [Data Agent](../actors/agents.md#actor.data_agent) | none | A3 | always | Classify columns, tag sensitivity and set masking rules. |
| 5 | **Transform** | ACTIVITY | inline | [Data Agent](../actors/agents.md#actor.data_agent) | none | A3 | always | Build curated and mart layers with lineage. |
| 6 | **Publish** | ACTIVITY | inline | [Data Agent](../actors/agents.md#actor.data_agent) | none | A3 | always | Publish the dataset to the catalogue. |
| 7 | **Grant Access** | ACTIVITY | [Route to Approver](../activities/route-to-approver.md) | [Data Agent](../actors/agents.md#actor.data_agent) | [Data Steward](../actors/humans-and-external.md#actor.data_steward) (always) | A2 | always | Steward approves access grants by purpose and masking. |
| 8 | **Record Lineage** | FINALIZE | inline | [Data Agent](../actors/agents.md#actor.data_agent) | none | A3 | always | Store upstream and downstream lineage. |

## Graph edges
`proc.data_product_publication` is the hub. Edges follow the hub-and-spoke pattern: the hub STARTs the first step, has an ACTIVITY edge to each middle step, FINALIZEs the last, and steps chain with NEXT.

```mermaid
graph LR
  H(("Data Product Publication"))
  S1["Register Source"]
  S2["Ingest"]
  S3["Check Data Quality"]
  S4["Classify PII"]
  S5["Transform"]
  S6["Publish"]
  S7["Grant Access"]
  S8["Record Lineage"]
  H -- START --> S1
  H -- ACTIVITY --> S2
  H -- ACTIVITY --> S3
  H -- ACTIVITY --> S4
  H -- ACTIVITY --> S5
  H -- ACTIVITY --> S6
  H -- ACTIVITY --> S7
  H -- FINALIZE --> S8
  S1 -- NEXT --> S2
  S2 -- NEXT --> S3
  S3 -- NEXT --> S4
  S4 -- NEXT --> S5
  S5 -- NEXT --> S6
  S6 -- NEXT --> S7
  S7 -- NEXT --> S8
```

## Exceptions
| If | Then |
|---|---|
| PII found in an unclassified column | Block publish until classified. |
| Source schema changes | Pause ingest, notify the steward. |

## Finalize (done means)
Dataset published with classification, quality results, access grants and lineage.

## Data touched
| Object | Access | Backing tables |
|---|---|---|
| [Dataset](../objects/governance-and-data.md#obj.dataset) | reads and writes | `dl_datasets`, `dl_dataset_columns`, `dl_lineage_edges`, `dl_dq_rules`, `dl_dq_results`, `dl_access_grants` |

## Evidence emitted
Event types from the activities above (see [Audit and Evidence](../policies/audit-and-evidence.md)): `dq.evaluated`, `approval.requested`, `approval.approved`, `approval.rejected`, `approval.expired`.

## Related
- Related processes: [Regulatory Reporting](regulatory-reporting.md)
- Routing and event map: [routing.md](../routing.md)
