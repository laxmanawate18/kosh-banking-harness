---
id: act.collect_documents
type: activity
name: Collect Documents
version: 0.1.0
status: draft
skill_id: act.collect_documents
performed_by: [actor.onboarding_agent, actor.kyc_agent, actor.lending_agent, actor.insurance_agent]
approval_gate: actor.service_officer
approval_when: a tamper flag or low confidence needs a human verifier
autonomy: A3
governed_by: [pol.consent_privacy, pol.audit_evidence]
reads: [obj.document]
writes: [obj.document]
evidence: [doc.received, doc.verified, doc.rejected, doc.tamper_flag]
---
# Collect Documents

> Request, receive, scan and verify documents against a checklist.

## Inputs
- checklist (requirement codes)
- uploads from the customer

## Outputs
- checklist status per requirement
- extracted fields and confidence
- tamper flags

## Rules
- MUST scan for malware before reading content.
- MUST store content hash and storage key, not raw document text in chat.
- A tamper flag MUST go to a human verifier.

## If it fails
Malware hit: quarantine and ask for a new upload. Low confidence or tamper flag: route to a human verifier. Do not accept or reject a document on a flag alone.

## Authority
- **Autonomy:** A3 (Act within limits). Agent executes alone inside policy limits and parameters; every action is audited; anything outside limits escalates.
- **Approval gate:** [Service Officer](../actors/humans-and-external.md#actor.service_officer) only when a tamper flag or low confidence needs a human verifier
- **May be performed by:** [Onboarding Agent](../actors/agents.md#actor.onboarding_agent), [KYC Agent](../actors/agents.md#actor.kyc_agent), [Lending Agent](../actors/agents.md#actor.lending_agent), [Insurance Agent](../actors/agents.md#actor.insurance_agent)
- **Governed by:** [Consent and Privacy](../policies/consent-and-privacy.md), [Audit and Evidence](../policies/audit-and-evidence.md)

## Data
- **Reads:** [Document](../objects/customer.md#obj.document)
- **Writes:** [Document](../objects/customer.md#obj.document)
- **Backing tables:** `documents`, `los_application_documents`, `ins_claim_documents`

## Evidence
Emit: `doc.received`, `doc.verified`, `doc.rejected`, `doc.tamper_flag`. Shape and rules: [Audit and Evidence](../policies/audit-and-evidence.md).

## Used by
- [Perpetual KYC](../processes/perpetual-kyc.md), step "Request Documents"
- [Loan Origination](../processes/loan-origination.md), step "Collect Documents"
- [Insurance Sale](../processes/insurance-sale.md), step "Proposal and Consent"
- [Claim Assistance](../processes/claim-assistance.md), step "Collect Documents"
