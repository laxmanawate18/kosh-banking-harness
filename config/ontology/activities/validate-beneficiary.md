---
id: act.validate_beneficiary
type: activity
name: Validate Beneficiary
version: 0.1.0
status: draft
skill_id: act.validate_beneficiary
performed_by: [actor.payments_agent]
approval_gate: actor.fraud_analyst
approval_when: a mule or sanctions indicator is found
autonomy: A3
governed_by: [pol.agent_guardrails, pol.audit_evidence]
reads: [obj.beneficiary]
writes: [obj.beneficiary]
evidence: [beneficiary.validated, beneficiary.restricted]
---
# Validate Beneficiary

> Validate payee account details, check name match and flag mule or sanctions indicators.

## Inputs
- payee identifier (account, IFSC, UPI id)
- stated payee name

## Outputs
- valid or invalid
- name match result
- risk status

## Rules
- Name mismatch MUST be shown to the customer before they confirm.
- A new payee MUST NOT bypass the cooling-off limit.

## If it fails
Invalid details: ask the customer to re-enter. Mule or sanctions indicator: restrict the payee and route to a fraud analyst.

## Authority
- **Autonomy:** A3 (Act within limits). Agent executes alone inside policy limits and parameters; every action is audited; anything outside limits escalates.
- **Approval gate:** [Fraud Analyst](../actors/humans-and-external.md#actor.fraud_analyst) only when a mule or sanctions indicator is found
- **May be performed by:** [Payments and Cards Agent](../actors/agents.md#actor.payments_agent)
- **Governed by:** [Agent Guardrails](../policies/agent-guardrails.md), [Audit and Evidence](../policies/audit-and-evidence.md)

## Data
- **Reads:** [Beneficiary](../objects/accounts-payments.md#obj.beneficiary)
- **Writes:** [Beneficiary](../objects/accounts-payments.md#obj.beneficiary)
- **Backing tables:** `bank_beneficiaries`

## Evidence
Emit: `beneficiary.validated`, `beneficiary.restricted`. Shape and rules: [Audit and Evidence](../policies/audit-and-evidence.md).

## Used by
- [Payment Authorisation](../processes/payment-authorisation.md), step "Validate Beneficiary"
- [Beneficiary Addition](../processes/beneficiary-addition.md), step "Validate Account Details"
