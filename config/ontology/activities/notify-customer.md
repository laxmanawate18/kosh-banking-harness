---
id: act.notify_customer
type: activity
name: Notify Customer
version: 0.1.0
status: draft
skill_id: act.notify_customer
performed_by: [actor.onboarding_agent, actor.marketing_agent, actor.retention_agent, actor.service_agent, actor.payments_agent, actor.collections_agent, actor.insurance_agent, actor.fraud_agent]
approval_gate: none
approval_when: n/a
autonomy: A3
governed_by: [pol.consent_privacy, pol.audit_evidence]
reads: [obj.customer, obj.channel]
writes: [obj.interaction]
evidence: [notify.sent, notify.failed]
---
# Notify Customer

> Send a message by the customer's preferred channel using an approved template.

## Inputs
- customer
- template code and variables
- notice class (transactional, regulatory, promotional)

## Outputs
- outbox record and delivery status

## Rules
- MUST use an approved template. Free-text outbound is not allowed for regulatory notices.
- Promotional messages REQUIRE an allow from check_consent and respect quiet hours and frequency caps.
- NEVER include full account numbers, OTPs or ID numbers in a message.

## If it fails
Delivery failure: retry on the next preferred channel for transactional or regulatory notices. For promotional messages, do not retry on another channel.

## Authority
- **Autonomy:** A3 (Act within limits). Agent executes alone inside policy limits and parameters; every action is audited; anything outside limits escalates.
- **Approval gate:** none
- **May be performed by:** [Onboarding Agent](../actors/agents.md#actor.onboarding_agent), [Marketing Agent](../actors/agents.md#actor.marketing_agent), [Retention Agent](../actors/agents.md#actor.retention_agent), [Service Agent](../actors/agents.md#actor.service_agent), [Payments and Cards Agent](../actors/agents.md#actor.payments_agent), [Collections Agent](../actors/agents.md#actor.collections_agent), [Insurance Agent](../actors/agents.md#actor.insurance_agent), [Fraud Triage Agent](../actors/agents.md#actor.fraud_agent)
- **Governed by:** [Consent and Privacy](../policies/consent-and-privacy.md), [Audit and Evidence](../policies/audit-and-evidence.md)

## Data
- **Reads:** [Customer](../objects/customer.md#obj.customer), [Channel](../objects/engagement.md#obj.channel)
- **Writes:** [Interaction](../objects/engagement.md#obj.interaction)
- **Backing tables:** `notification_outbox`, `crm_message_templates`, `bank_preferences`

## Evidence
Emit: `notify.sent`, `notify.failed`. Shape and rules: [Audit and Evidence](../policies/audit-and-evidence.md).

## Used by
- [Account Opening](../processes/account-opening.md), step "Order Checks"
- [Perpetual KYC](../processes/perpetual-kyc.md), step "Update KYC"
- [Next Best Offer](../processes/next-best-offer.md), step "Deliver"
- [Churn Retention](../processes/churn-retention.md), step "Outreach"
- [Service Case (Control Tower)](../processes/service-case.md), step "Confirm with Customer"
- [Contact Detail Change](../processes/contact-detail-change.md), step "Notify Old and New Contact"
- [Loan Origination](../processes/loan-origination.md), step "Sanction"
- [Collections](../processes/collections.md), step "Remind"
- [Payment Authorisation](../processes/payment-authorisation.md), step "Notify"
- [Fraud and Dispute](../processes/fraud-and-dispute.md), step "Contact Customer"
- [Fraud and Dispute](../processes/fraud-and-dispute.md), step "Resolve"
- [Card Lifecycle](../processes/card-lifecycle.md), step "Close"
- [Beneficiary Addition](../processes/beneficiary-addition.md), step "Activate Payee"
- [Term Deposit Lifecycle](../processes/term-deposit-lifecycle.md), step "Capture Maturity Instruction"
- [Dormancy and Closure](../processes/dormancy-and-closure.md), step "Archive Records"
- [Data Subject Request](../processes/data-subject-request.md), step "Confirm to Customer"
- [Claim Assistance](../processes/claim-assistance.md), step "Close"
