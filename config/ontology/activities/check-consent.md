---
id: act.check_consent
type: activity
name: Check Consent
version: 0.1.0
status: draft
skill_id: act.check_consent
performed_by: [actor.marketing_agent, actor.retention_agent, actor.lending_agent, actor.insurance_agent, actor.onboarding_agent, actor.service_agent, actor.collections_agent, actor.data_agent]
approval_gate: none
approval_when: n/a
autonomy: A3
governed_by: [pol.consent_privacy, pol.audit_evidence]
reads: [obj.customer, obj.consent]
writes: []
evidence: [consent.checked]
---
# Check Consent

> Decide whether a purpose and data scope is permitted for this customer right now.

## Inputs
- customer id
- purpose (e.g. marketing, credit_check, insurance_data_sharing)
- channel and data scope

## Outputs
- allow or deny
- consent id relied on
- reason if denied

## Rules
- A consent is active only if revoked_at is empty and it is not expired.
- Marketing consent MUST NOT be used for regulatory or transactional messages, and the reverse.
- MUST record the consent id relied on in the audit event.

## If it fails
No active consent for the purpose: stop that branch. Ask the customer for consent if the process allows, otherwise take the no-data alternative. Never infer consent.

## Authority
- **Autonomy:** A3 (Act within limits). Agent executes alone inside policy limits and parameters; every action is audited; anything outside limits escalates.
- **Approval gate:** none
- **May be performed by:** [Marketing Agent](../actors/agents.md#actor.marketing_agent), [Retention Agent](../actors/agents.md#actor.retention_agent), [Lending Agent](../actors/agents.md#actor.lending_agent), [Insurance Agent](../actors/agents.md#actor.insurance_agent), [Onboarding Agent](../actors/agents.md#actor.onboarding_agent), [Service Agent](../actors/agents.md#actor.service_agent), [Collections Agent](../actors/agents.md#actor.collections_agent), [Data Agent](../actors/agents.md#actor.data_agent)
- **Governed by:** [Consent and Privacy](../policies/consent-and-privacy.md), [Audit and Evidence](../policies/audit-and-evidence.md)

## Data
- **Reads:** [Customer](../objects/customer.md#obj.customer), [Consent](../objects/customer.md#obj.consent)
- **Writes:** none
- **Backing tables:** `consents`, `bank_preferences`

## Evidence
Emit: `consent.checked`. Shape and rules: [Audit and Evidence](../policies/audit-and-evidence.md).

## Used by
- [Account Opening](../processes/account-opening.md), step "Onboarding"
- [Next Best Offer](../processes/next-best-offer.md), step "Check Consent"
- [Churn Retention](../processes/churn-retention.md), step "Outreach"
- [Loan Origination](../processes/loan-origination.md), step "Pre-qualify"
- [Collections](../processes/collections.md), step "Contact"
- [Term Deposit Lifecycle](../processes/term-deposit-lifecycle.md), step "Capture Maturity Instruction"
- [Agent Action Approval](../processes/agent-action-approval.md), step "Check Consent"
- [Insurance Sale](../processes/insurance-sale.md), step "Proposal and Consent"
