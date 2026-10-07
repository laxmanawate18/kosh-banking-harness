---
id: act.risk_rate_customer
type: activity
name: Risk-Rate Customer
version: 0.1.0
status: draft
skill_id: act.risk_rate_customer
performed_by: [actor.onboarding_agent, actor.kyc_agent]
approval_gate: actor.compliance_officer
approval_when: the rating is high
autonomy: A3
governed_by: [pol.approval_matrix, pol.audit_evidence]
reads: [obj.customer, obj.risk_factor, obj.kyc_record]
writes: [obj.kyc_record, obj.risk_factor]
evidence: [kyc.risk_rated]
---
# Risk-Rate Customer

> Compute or refresh the customer's risk rating from risk factors such as geography, occupation, product, channel, PEP status and behaviour.

## Inputs
- customer profile
- screening result
- product and channel
- transaction behaviour summary

## Outputs
- risk rating: low, medium or high
- contributing risk factors with weights
- model version

## Rules
- Low and medium MAY proceed automatically.
- High risk REQUIRES compliance officer approval and enhanced due diligence before the account is usable.
- MUST record the model version and factors so the rating can be explained.

## If it fails
If a factor source is missing, rate conservatively (higher) and flag the gap. Never default to low.

## Authority
- **Autonomy:** A3 (Act within limits). Agent executes alone inside policy limits and parameters; every action is audited; anything outside limits escalates.
- **Approval gate:** [Compliance Officer](../actors/humans-and-external.md#actor.compliance_officer) only when the rating is high
- **May be performed by:** [Onboarding Agent](../actors/agents.md#actor.onboarding_agent), [KYC Agent](../actors/agents.md#actor.kyc_agent)
- **Governed by:** [Approval Matrix](../policies/approval-matrix.md), [Audit and Evidence](../policies/audit-and-evidence.md)

## Data
- **Reads:** [Customer](../objects/customer.md#obj.customer), [Risk Factor](../objects/customer.md#obj.risk_factor), [KYC Record](../objects/customer.md#obj.kyc_record)
- **Writes:** [KYC Record](../objects/customer.md#obj.kyc_record), [Risk Factor](../objects/customer.md#obj.risk_factor)
- **Backing tables:** `core_kyc_records`, `model_registry`

## Evidence
Emit: `kyc.risk_rated`. Shape and rules: [Audit and Evidence](../policies/audit-and-evidence.md).

## Used by
- [Account Opening](../processes/account-opening.md), step "Check Compliance"
- [Perpetual KYC](../processes/perpetual-kyc.md), step "Re-score Risk"
