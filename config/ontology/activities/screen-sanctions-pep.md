---
id: act.screen_sanctions_pep
type: activity
name: Screen Sanctions and PEP
version: 0.1.0
status: draft
skill_id: act.screen_sanctions_pep
performed_by: [actor.onboarding_agent, actor.kyc_agent, actor.aml_agent]
approval_gate: actor.compliance_officer
approval_when: there is any potential or confirmed match
autonomy: A3
governed_by: [pol.agent_guardrails, pol.audit_evidence, pol.approval_matrix]
reads: [obj.customer, obj.kyc_record]
writes: [obj.alert, obj.kyc_record]
evidence: [aml.screening_clear, aml.screening_potential_match, aml.screening_confirmed_match]
---
# Screen Sanctions and PEP

> Screen a person or entity against sanctions, politically-exposed-person and adverse-media lists.

## Inputs
- name, date of birth, nationality
- identity document hash
- related parties if any

## Outputs
- result: clear, potential_match or confirmed_match
- alert reference if not clear

## Rules
- MAY auto-record 'clear' only when there is no potential match.
- ANY potential or confirmed match MUST go to the compliance officer. The agent never clears a match.
- NEVER tell the customer or any third party that a screening hit exists (no tipping off).

## If it fails
If the screening service is unavailable, pause the process (do not continue as clear) and retry. Escalate to the compliance officer after the retry limit.

## Authority
- **Autonomy:** A3 (Act within limits). Agent executes alone inside policy limits and parameters; every action is audited; anything outside limits escalates.
- **Approval gate:** [Compliance Officer](../actors/humans-and-external.md#actor.compliance_officer) only when there is any potential or confirmed match
- **May be performed by:** [Onboarding Agent](../actors/agents.md#actor.onboarding_agent), [KYC Agent](../actors/agents.md#actor.kyc_agent), [AML Triage Agent](../actors/agents.md#actor.aml_agent)
- **Governed by:** [Agent Guardrails](../policies/agent-guardrails.md), [Audit and Evidence](../policies/audit-and-evidence.md), [Approval Matrix](../policies/approval-matrix.md)

## Data
- **Reads:** [Customer](../objects/customer.md#obj.customer), [KYC Record](../objects/customer.md#obj.kyc_record)
- **Writes:** [Alert](../objects/service-and-risk.md#obj.alert), [KYC Record](../objects/customer.md#obj.kyc_record)
- **Backing tables:** `core_aml_alerts`, `core_kyc_records`

## Evidence
Emit: `aml.screening_clear`, `aml.screening_potential_match`, `aml.screening_confirmed_match`. Shape and rules: [Audit and Evidence](../policies/audit-and-evidence.md).

## Used by
- [Account Opening](../processes/account-opening.md), step "Check Compliance"
- [Perpetual KYC](../processes/perpetual-kyc.md), step "Re-screen"
