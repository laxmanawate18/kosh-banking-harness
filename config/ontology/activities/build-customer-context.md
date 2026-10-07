---
id: act.build_customer_context
type: activity
name: Build Customer Context
version: 0.1.0
status: draft
skill_id: act.build_customer_context
performed_by: [actor.marketing_agent, actor.retention_agent, actor.service_agent, actor.kyc_agent, actor.aml_agent, actor.lending_agent, actor.insurance_agent]
approval_gate: none
approval_when: n/a
autonomy: A3
governed_by: [pol.consent_privacy, pol.agent_guardrails, pol.audit_evidence]
reads: [obj.customer, obj.account, obj.interaction, obj.case, obj.segment, obj.consent, obj.lead_opportunity]
writes: []
evidence: [context.built]
---
# Build Customer Context

> Assemble a purpose-limited 360 view: profile, products, recent activity, open cases, consents, segments and last interactions.

## Inputs
- customer id
- purpose of use

## Outputs
- context bundle limited to what the purpose needs

## Rules
- MUST apply data minimisation: include only what the stated purpose needs.
- Sensitive fields MUST stay masked in agent output unless the purpose requires them.

## If it fails
If a source is unavailable, continue with what is available and state the gap. Never fill gaps by assumption.

## Authority
- **Autonomy:** A3 (Act within limits). Agent executes alone inside policy limits and parameters; every action is audited; anything outside limits escalates.
- **Approval gate:** none
- **May be performed by:** [Marketing Agent](../actors/agents.md#actor.marketing_agent), [Retention Agent](../actors/agents.md#actor.retention_agent), [Service Agent](../actors/agents.md#actor.service_agent), [KYC Agent](../actors/agents.md#actor.kyc_agent), [AML Triage Agent](../actors/agents.md#actor.aml_agent), [Lending Agent](../actors/agents.md#actor.lending_agent), [Insurance Agent](../actors/agents.md#actor.insurance_agent)
- **Governed by:** [Consent and Privacy](../policies/consent-and-privacy.md), [Agent Guardrails](../policies/agent-guardrails.md), [Audit and Evidence](../policies/audit-and-evidence.md)

## Data
- **Reads:** [Customer](../objects/customer.md#obj.customer), [Account](../objects/accounts-payments.md#obj.account), [Interaction](../objects/engagement.md#obj.interaction), [Case](../objects/service-and-risk.md#obj.case), [Segment](../objects/customer.md#obj.segment), [Consent](../objects/customer.md#obj.consent), [Lead and Opportunity](../objects/engagement.md#obj.lead_opportunity)
- **Writes:** none
- **Backing tables:** `bank_customers`, `bank_accounts`, `bank_transactions`, `care_cases`, `crm_customer_segments`, `crm_interactions`

## Evidence
Emit: `context.built`. Shape and rules: [Audit and Evidence](../policies/audit-and-evidence.md).

## Used by
- [Perpetual KYC](../processes/perpetual-kyc.md), step "Detect Trigger"
- [Next Best Offer](../processes/next-best-offer.md), step "Build Customer Context"
- [Churn Retention](../processes/churn-retention.md), step "Diagnose Reason"
- [Service Case (Control Tower)](../processes/service-case.md), step "Investigate"
- [AML Alert Investigation](../processes/aml-alert-investigation.md), step "Enrich"
- [Insurance Sale](../processes/insurance-sale.md), step "Needs Analysis"
