---
id: act.authenticate_step_up
type: activity
name: Authenticate (Step-Up)
version: 0.1.0
status: draft
skill_id: act.authenticate_step_up
performed_by: [actor.payments_agent, actor.service_agent, actor.onboarding_agent, actor.insurance_agent]
approval_gate: none
approval_when: n/a
autonomy: A3
governed_by: [pol.authentication_assurance, pol.audit_evidence]
reads: [obj.customer, obj.payment]
writes: [obj.payment]
evidence: [auth.step_up_passed, auth.step_up_failed, auth.step_up_locked]
---
# Authenticate (Step-Up)

> Make sure the session's assurance level meets what the action requires, and challenge the customer if it does not.

## Inputs
- session
- action and its required assurance level
- device

## Outputs
- achieved assurance level
- challenge result

## Rules
- The customer completes the challenge. The agent never receives or relays OTP values.
- NEVER lower the required assurance level to reduce friction.

## If it fails
After the permitted number of failed attempts, lock step-up for the lock period, stop the action and hand off to a service officer. Repeated failures right after a contact change flag possible account takeover.

## Authority
- **Autonomy:** A3 (Act within limits). Agent executes alone inside policy limits and parameters; every action is audited; anything outside limits escalates.
- **Approval gate:** none
- **May be performed by:** [Payments and Cards Agent](../actors/agents.md#actor.payments_agent), [Service Agent](../actors/agents.md#actor.service_agent), [Onboarding Agent](../actors/agents.md#actor.onboarding_agent), [Insurance Agent](../actors/agents.md#actor.insurance_agent)
- **Governed by:** [Authentication Assurance](../policies/authentication-assurance.md), [Audit and Evidence](../policies/audit-and-evidence.md)

## Data
- **Reads:** [Customer](../objects/customer.md#obj.customer), [Payment](../objects/accounts-payments.md#obj.payment)
- **Writes:** [Payment](../objects/accounts-payments.md#obj.payment)
- **Backing tables:** `auth_sessions`, `bank_challenges`, `bank_devices`

## Evidence
Emit: `auth.step_up_passed`, `auth.step_up_failed`, `auth.step_up_locked`. Shape and rules: [Audit and Evidence](../policies/audit-and-evidence.md).

## Used by
- [Account Opening](../processes/account-opening.md), step "Activate Digital Banking"
- [Contact Detail Change](../processes/contact-detail-change.md), step "Authenticate"
- [Payment Authorisation](../processes/payment-authorisation.md), step "Authenticate"
- [Payment Authorisation](../processes/payment-authorisation.md), step "Step-up Challenge"
- [Fraud and Dispute](../processes/fraud-and-dispute.md), step "Contact Customer"
- [Card Lifecycle](../processes/card-lifecycle.md), step "Request"
- [Card Lifecycle](../processes/card-lifecycle.md), step "Activate"
- [Beneficiary Addition](../processes/beneficiary-addition.md), step "Authenticate"
- [Dormancy and Closure](../processes/dormancy-and-closure.md), step "Verify Customer"
- [Insurance Sale](../processes/insurance-sale.md), step "Set Up Premium Payment"
