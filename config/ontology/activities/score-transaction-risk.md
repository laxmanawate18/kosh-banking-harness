---
id: act.score_transaction_risk
type: activity
name: Score Transaction Risk
version: 0.1.0
status: draft
skill_id: act.score_transaction_risk
performed_by: [actor.payments_agent, actor.fraud_agent]
approval_gate: actor.fraud_analyst
approval_when: a block is reviewed or overridden
autonomy: A3
governed_by: [pol.approval_matrix, pol.agent_guardrails, pol.audit_evidence]
reads: [obj.payment, obj.customer, obj.beneficiary]
writes: [obj.payment]
evidence: [payment.risk_decision]
---
# Score Transaction Risk

> Score a payment or payee change for fraud and mule risk and return allow, step-up or block.

## Inputs
- payment or payee context
- device and session
- beneficiary age
- behavioural baseline

## Outputs
- risk score
- decision: allow, step_up or block
- policy version and model version

## Rules
- MUST record policy_version and model version with the decision.
- A block MAY be applied immediately and is reviewed by a fraud analyst afterwards.
- NEVER reveal the detection rules to the customer.

## If it fails
If the model is unavailable, fail safe: require step-up (low value) or hold for review (high value). Never fail open.

## Authority
- **Autonomy:** A3 (Act within limits). Agent executes alone inside policy limits and parameters; every action is audited; anything outside limits escalates.
- **Approval gate:** [Fraud Analyst](../actors/humans-and-external.md#actor.fraud_analyst) only when a block is reviewed or overridden
- **May be performed by:** [Payments and Cards Agent](../actors/agents.md#actor.payments_agent), [Fraud Triage Agent](../actors/agents.md#actor.fraud_agent)
- **Governed by:** [Approval Matrix](../policies/approval-matrix.md), [Agent Guardrails](../policies/agent-guardrails.md), [Audit and Evidence](../policies/audit-and-evidence.md)

## Data
- **Reads:** [Payment](../objects/accounts-payments.md#obj.payment), [Customer](../objects/customer.md#obj.customer), [Beneficiary](../objects/accounts-payments.md#obj.beneficiary)
- **Writes:** [Payment](../objects/accounts-payments.md#obj.payment)
- **Backing tables:** `bank_sentinel_decisions`, `model_registry`, `bank_security_alerts`

## Evidence
Emit: `payment.risk_decision`. Shape and rules: [Audit and Evidence](../policies/audit-and-evidence.md).

## Used by
- [Payment Authorisation](../processes/payment-authorisation.md), step "Score Risk"
- [Beneficiary Addition](../processes/beneficiary-addition.md), step "Risk Check"
