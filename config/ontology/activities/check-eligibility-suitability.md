---
id: act.check_eligibility_suitability
type: activity
name: Check Eligibility and Suitability
version: 0.1.0
status: draft
skill_id: act.check_eligibility_suitability
performed_by: [actor.marketing_agent, actor.retention_agent, actor.lending_agent, actor.insurance_agent]
approval_gate: actor.relationship_manager
approval_when: the customer is vulnerable or suitability is unclear
autonomy: A3
governed_by: [pol.agent_guardrails, pol.approval_matrix, pol.audit_evidence]
reads: [obj.customer, obj.product, obj.offer]
writes: []
evidence: [product.eligibility_checked]
---
# Check Eligibility and Suitability

> Check that the customer is eligible for a product and that it is suitable for their needs, capacity and vulnerability status.

## Inputs
- customer context
- product eligibility rules
- customer need or goal

## Outputs
- eligible or not with reasons
- suitable or not with reasons
- vulnerability flag

## Rules
- Eligibility MUST be shown with reasons.
- NEVER make one product conditional on buying another unless the product rules say so (no tied selling).
- Vulnerable customers MUST be handled by a human before a sale.

## If it fails
Vulnerable customer or unclear suitability: route to a human. A 'not suitable' result is final for the agent.

## Authority
- **Autonomy:** A3 (Act within limits). Agent executes alone inside policy limits and parameters; every action is audited; anything outside limits escalates.
- **Approval gate:** [Relationship Manager](../actors/humans-and-external.md#actor.relationship_manager) only when the customer is vulnerable or suitability is unclear
- **May be performed by:** [Marketing Agent](../actors/agents.md#actor.marketing_agent), [Retention Agent](../actors/agents.md#actor.retention_agent), [Lending Agent](../actors/agents.md#actor.lending_agent), [Insurance Agent](../actors/agents.md#actor.insurance_agent)
- **Governed by:** [Agent Guardrails](../policies/agent-guardrails.md), [Approval Matrix](../policies/approval-matrix.md), [Audit and Evidence](../policies/audit-and-evidence.md)

## Data
- **Reads:** [Customer](../objects/customer.md#obj.customer), [Product](../objects/engagement.md#obj.product), [Offer](../objects/engagement.md#obj.offer)
- **Writes:** none
- **Backing tables:** `core_products`, `crm_offers`, `los_loan_products`, `ins_products`

## Evidence
Emit: `product.eligibility_checked`. Shape and rules: [Audit and Evidence](../policies/audit-and-evidence.md).

## Used by
- [Next Best Offer](../processes/next-best-offer.md), step "Check Eligibility and Suitability"
- [Churn Retention](../processes/churn-retention.md), step "Make Retention Offer"
- [Loan Origination](../processes/loan-origination.md), step "Pre-qualify"
- [Insurance Sale](../processes/insurance-sale.md), step "Needs Analysis"
