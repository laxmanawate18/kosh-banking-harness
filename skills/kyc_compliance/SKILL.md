---
name: kyc-compliance
description: Document-assisted Indian retail KYC and re-KYC with customer review and independent bank verification.
---
# KYC and re-KYC workflow

## Workflow
1. Call get_kyc_status to establish initial KYC, periodic update, no-change eligibility or existing review. Open start_banking_workflow("kyc"). No-change re-KYC is only available to previously verified customers and is still reviewed; do not impose invented regulatory deadlines.
2. Ask the customer to use the form's document upload, grant document-processing permission and select PAN or completed Form 60 plus an identity/address document. Aadhaar is one option; also support passport, driving licence, voter ID, NREGA job card and NPR letter. PAN alone is not address proof. Ask for a masked Aadhaar copy, never twelve digits. Originals are access-controlled and encrypted.
3. Google Document AI (configured processor) or Cloud Vision performs actual OCR, and the bank's own parser pre-fills full_name, date_of_birth, pan_number, address, pincode and document_last4 on the server. You never receive document text or values: you are told which details were found and which are still needed. Ask the customer to check and complete the form; unreadable or absent fields stay blank for them to fill. Never ask them to type identity numbers in chat. PAN does not contain a residential address. Do not infer declarations from documents.
4. Extracted values populate the form with provenance labels. Customer corrections always win. Compare names and DOB across documents; report conflicts for officer review. Check PAN format, required evidence, OVD expiry, address completeness and PIN code. Quality scores are OCR measurements, never identity confidence or issuer confirmation.
5. Use structured choices for occupation, annual income, source of funds, tax residency, US-person status and PEP status. Cross-border residency needs country/TIN details; PEP declarations need role and relationship. Route these to enhanced bank review, not automatic rejection.
6. The UI saves a draft, checks completeness, presents an exact summary, collects customer confirmation, then requires fresh step-up before one P1-17 request is created. Keep status SUBMITTED_FOR_REVIEW until the bank completes verification. Do not create fake attachment names or affirmative verification flags.
7. The officer receives real evidence references and checks. PAN issuer verification, Aadhaar signature/authentication, sanctions screening, face matching and V-CIP/liveness are independent processes. OCR or a selfie does not perform them. Never claim live NSDL/UIDAI checks or successful liveness. Provider status must remain not connected / pending until a bank actually performs the check. Video KYC (V-CIP) runs only at the bank's KYC provider via start_video_kyc; its signed result, not the chat, updates KYC. In this demo the provider is a clearly labelled sandbox.

## References and boundary
RBI KYC Master Direction (including subsequent amendments): https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=11566
RBI 2025 periodic-update amendment: https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12866
UIDAI offline verification: https://uidai.gov.in/en/ecosystem/authentication-devices-documents/about-aadhaar-paperless-offline-e-kyc.html
These sources inform the workflow, not a claim of compliance. CKYCR retrieval, PAN status verification, UIDAI signature verification, sanctions/PEP screening and V-CIP need authorized bank integrations. Do not reuse documents from another customer.

