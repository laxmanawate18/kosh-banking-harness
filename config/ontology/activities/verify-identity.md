---
id: act.verify_identity
type: activity
name: Verify Identity
version: 0.1.0
status: draft
skill_id: act.verify_identity
performed_by: [actor.kyc_agent, actor.onboarding_agent, actor.lending_agent, actor.data_agent, actor.service_agent]
approval_gate: actor.compliance_officer
approval_when: automated verification fails or confidence is low (manual review)
autonomy: A3
governed_by: [pol.consent_privacy, pol.authentication_assurance, pol.audit_evidence]
reads: [obj.customer, obj.document]
writes: [obj.kyc_record]
evidence: [kyc.identity_verified, kyc.identity_failed, kyc.identity_manual_review]
---
# Verify Identity

> Confirm that a person is who they claim to be using eKYC, document match and liveness or video.

## Inputs
- person reference (customer or applicant)
- identity document
- customer consent to verify

## Outputs
- verification result: verified, failed or manual_review
- KYC level achieved
- provider reference

## Rules
- MUST store only a hash of identity numbers. Never repeat full ID numbers in chat or logs.
- MUST capture consent before sending images to a verification provider.
- NEVER downgrade a failed verification to a pass because the customer is waiting.

## If it fails
Retry once on provider error. If it still fails or confidence is low, set manual_review and route to the compliance officer. A provider error is never treated as a pass.

## Authority
- **Autonomy:** A3 (Act within limits). Agent executes alone inside policy limits and parameters; every action is audited; anything outside limits escalates.
- **Approval gate:** [Compliance Officer](../actors/humans-and-external.md#actor.compliance_officer) only when automated verification fails or confidence is low (manual review)
- **May be performed by:** [KYC Agent](../actors/agents.md#actor.kyc_agent), [Onboarding Agent](../actors/agents.md#actor.onboarding_agent), [Lending Agent](../actors/agents.md#actor.lending_agent), [Data Agent](../actors/agents.md#actor.data_agent), [Service Agent](../actors/agents.md#actor.service_agent)
- **Governed by:** [Consent and Privacy](../policies/consent-and-privacy.md), [Authentication Assurance](../policies/authentication-assurance.md), [Audit and Evidence](../policies/audit-and-evidence.md)

## Data
- **Reads:** [Customer](../objects/customer.md#obj.customer), [Document](../objects/customer.md#obj.document)
- **Writes:** [KYC Record](../objects/customer.md#obj.kyc_record)
- **Backing tables:** `ekyc_sessions`, `core_kyc_records`, `documents`

## Evidence
Emit: `kyc.identity_verified`, `kyc.identity_failed`, `kyc.identity_manual_review`. Shape and rules: [Audit and Evidence](../policies/audit-and-evidence.md).

## Used by
- [Account Opening](../processes/account-opening.md), step "Verify Identity"
- [Loan Origination](../processes/loan-origination.md), step "Verify Identity"
- [Dormancy and Closure](../processes/dormancy-and-closure.md), step "Verify Customer"
- [Data Subject Request](../processes/data-subject-request.md), step "Verify Identity"
- [Claim Assistance](../processes/claim-assistance.md), step "Verify Policy"
