---
id: act.pull_credit_bureau
type: activity
name: Pull Credit Bureau
version: 0.1.0
status: draft
skill_id: act.pull_credit_bureau
performed_by: [actor.lending_agent, actor.onboarding_agent]
approval_gate: none
approval_when: n/a
autonomy: A3
governed_by: [pol.consent_privacy, pol.audit_evidence]
reads: [obj.customer, obj.consent]
writes: [obj.credit_report]
evidence: [credit.bureau_pulled]
---
# Pull Credit Bureau

> Fetch the applicant's credit report and score, with consent.

## Inputs
- applicant
- consent id for credit_check

## Outputs
- bureau score and summary
- report expiry

## Rules
- MUST NOT pull without active credit_check consent.
- MUST NOT pull speculatively (no application, no pull).
- Reuse a report only within its expiry.

## If it fails
Bureau timeout: retry once, then pause the application and notify the credit officer. Never estimate a score.

## Authority
- **Autonomy:** A3 (Act within limits). Agent executes alone inside policy limits and parameters; every action is audited; anything outside limits escalates.
- **Approval gate:** none
- **May be performed by:** [Lending Agent](../actors/agents.md#actor.lending_agent), [Onboarding Agent](../actors/agents.md#actor.onboarding_agent)
- **Governed by:** [Consent and Privacy](../policies/consent-and-privacy.md), [Audit and Evidence](../policies/audit-and-evidence.md)

## Data
- **Reads:** [Customer](../objects/customer.md#obj.customer), [Consent](../objects/customer.md#obj.consent)
- **Writes:** [Credit Report](../objects/lending.md#obj.credit_report)
- **Backing tables:** `los_credit_reports`, `consents`

## Evidence
Emit: `credit.bureau_pulled`. Shape and rules: [Audit and Evidence](../policies/audit-and-evidence.md).

## Used by
- [Account Opening](../processes/account-opening.md), step "Check Credit History"
- [Loan Origination](../processes/loan-origination.md), step "Pull Credit Bureau"
