---
id: proc.perpetual_kyc
type: process
name: Perpetual KYC
domain: customer-lifecycle
version: 0.1.0
status: draft
performed_by: actor.kyc_agent
escalates_to: [actor.compliance_officer]
triggered_by: [evt.kyc_review_due, evt.profile_changed, evt.adverse_media_hit]
emits: []
uses_activities: [act.build_customer_context, act.screen_sanctions_pep, act.risk_rate_customer, act.collect_documents, act.route_to_approver, act.notify_customer]
governed_by: [pol.consent_privacy, pol.agent_guardrails, pol.approval_matrix, pol.audit_evidence]
reads: [obj.customer, obj.kyc_record, obj.risk_factor]
writes: [obj.kyc_record, obj.risk_factor, obj.alert, obj.document]
kosh_status: partial
kosh_channels: [customer, officer]
kosh_tools: [get_kyc_status, start_banking_workflow, record_document_extraction, validate_kyc_document, start_video_kyc, get_request_details, draft_decision_note]
kosh_skills: [kyc]
kosh_care: []
kosh_services: [P1-16, P1-17]
kosh_tables: [banking_workflows, documents, service_requests, approval_actions, ekyc_sessions]
kosh_note: Customers check KYC status and submit KYC or re-KYC through the guided form or a video KYC booking; an officer verifies. Screening, risk rating and adverse-media checks are not run in chat.
---
# Perpetual KYC

> Keeps identity, risk and documents current by reacting to events instead of waiting for a calendar review.

## Use this process when
- refresh KYC
- periodic review
- re-verify a customer
- risk rating changed
- adverse media on a customer

## Do not use it when
- new customer onboarding: use [Account Opening](account-opening.md)
- AML alert on a transaction: use [AML Alert Investigation](aml-alert-investigation.md)

## Trigger and ownership
- **Triggered by:** [KYC review due](../events.md#evt.kyc_review_due), [Customer profile changed](../events.md#evt.profile_changed), [Adverse media hit](../events.md#evt.adverse_media_hit)
- **Performed by:** [KYC Agent](../actors/agents.md#actor.kyc_agent) (autonomy ceiling A3)
- **Escalates to:** [Compliance Officer](../actors/humans-and-external.md#actor.compliance_officer)
- **Emits:** none
- **Governed by:** [Consent and Privacy](../policies/consent-and-privacy.md), [Agent Guardrails](../policies/agent-guardrails.md), [Approval Matrix](../policies/approval-matrix.md), [Audit and Evidence](../policies/audit-and-evidence.md)

## Flow
Work the steps in order. At each step, open the linked activity file before acting. A step marked conditional is skipped when its condition is false, and the skip is recorded.

| # | Step | Edge | Activities | Performed by | Approval gate | Autonomy | Condition | What happens |
|---|---|---|---|---|---|---|---|---|
| 1 | **Detect Trigger** | START | [Build Customer Context](../activities/build-customer-context.md) | [KYC Agent](../actors/agents.md#actor.kyc_agent) | none | A3 | always | Load the customer and the trigger reason (scheduled, profile change or adverse media). |
| 2 | **Refresh Profile** | ACTIVITY | inline | [KYC Agent](../actors/agents.md#actor.kyc_agent) | none | A3 | always | Compare declared data with observed behaviour (income vs turnover, address vs activity) and list discrepancies. |
| 3 | **Re-screen** | ACTIVITY | [Screen Sanctions and PEP](../activities/screen-sanctions-pep.md) | [KYC Agent](../actors/agents.md#actor.kyc_agent) | none | A3 | always | Re-screen the customer and related parties. |
| 4 | **Re-score Risk** | ACTIVITY | [Risk-Rate Customer](../activities/risk-rate-customer.md) | [KYC Agent](../actors/agents.md#actor.kyc_agent) | none | A3 | always | Recompute risk rating and compare with the previous rating. |
| 5 | **Request Documents** | ACTIVITY | [Collect Documents](../activities/collect-documents.md) | [KYC Agent](../actors/agents.md#actor.kyc_agent) | none | A3 | Only if risk increased or data is stale or inconsistent. | Ask the customer for updated documents. |
| 6 | **Officer Review** | ACTIVITY | [Route to Approver](../activities/route-to-approver.md) | [KYC Agent](../actors/agents.md#actor.kyc_agent) | [Compliance Officer](../actors/humans-and-external.md#actor.compliance_officer) (always) | A2 | Only if risk increased, a match exists or documents are unresolved. | Compliance officer decides whether to keep, restrict or exit the relationship. |
| 7 | **Update KYC** | FINALIZE | [Notify Customer](../activities/notify-customer.md) | [KYC Agent](../actors/agents.md#actor.kyc_agent) | none | A3 | always | Store the new KYC level, set next_review_due and notify the customer if needed. |

## Graph edges
`proc.perpetual_kyc` is the hub. Edges follow the hub-and-spoke pattern: the hub STARTs the first step, has an ACTIVITY edge to each middle step, FINALIZEs the last, and steps chain with NEXT.

```mermaid
graph LR
  H(("Perpetual KYC"))
  S1["Detect Trigger"]
  S2["Refresh Profile"]
  S3["Re-screen"]
  S4["Re-score Risk"]
  S5["Request Documents"]
  S6["Officer Review"]
  S7["Update KYC"]
  H -- START --> S1
  H -- ACTIVITY --> S2
  H -- ACTIVITY --> S3
  H -- ACTIVITY --> S4
  H -- ACTIVITY --> S5
  H -- ACTIVITY --> S6
  H -- FINALIZE --> S7
  S1 -- NEXT --> S2
  S2 -- NEXT --> S3
  S3 -- NEXT --> S4
  S4 -- NEXT --> S5
  S5 -- NEXT --> S6
  S6 -- NEXT --> S7
```

## Exceptions
| If | Then |
|---|---|
| Customer does not respond to document request | Escalate in steps per policy, then restrict the account only on compliance officer approval. |
| Match found during re-screen | Stop automated steps. Compliance officer decides. No tipping off. |
| Rating moves to high | Trigger enhanced due diligence. |

## Finalize (done means)
KYC record updated, next review date set and every change evidenced.

## Data touched
| Object | Access | Backing tables |
|---|---|---|
| [Customer](../objects/customer.md#obj.customer) | reads | `bank_customers`, `core_customer_contacts`, `bank_preferences`, `app_users` |
| [KYC Record](../objects/customer.md#obj.kyc_record) | reads and writes | `core_kyc_records`, `ekyc_sessions` |
| [Risk Factor](../objects/customer.md#obj.risk_factor) | reads and writes | `core_kyc_records`, `core_aml_alerts` |
| [Alert](../objects/service-and-risk.md#obj.alert) | writes | `core_aml_alerts`, `bank_security_alerts` |
| [Document](../objects/customer.md#obj.document) | writes | `documents`, `los_application_documents`, `ins_claim_documents`, `ret_statements` |

## Evidence emitted
Event types from the activities above (see [Audit and Evidence](../policies/audit-and-evidence.md)): `context.built`, `aml.screening_clear`, `aml.screening_potential_match`, `aml.screening_confirmed_match`, `kyc.risk_rated`, `doc.received`, `doc.verified`, `doc.rejected`, `doc.tamper_flag`, `approval.requested`, `approval.approved`, `approval.rejected`, `approval.expired`, `notify.sent`, `notify.failed`.

## Related
- Related processes: [Account Opening](account-opening.md), [AML Alert Investigation](aml-alert-investigation.md)
- Routing and event map: [routing.md](../routing.md)
