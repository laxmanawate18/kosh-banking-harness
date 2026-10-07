---
id: pol.consent_privacy
type: policy
name: Consent and Privacy
version: 0.1.0
status: draft
owner: privacy_officer
---
# Consent and Privacy

## Purposes
Use a controlled vocabulary for the `purpose` of a consent. The existing `consents.purpose` column is free text today. Normalise it to these values.

| Purpose | Needs customer consent? | Used by |
|---|---|---|
| `service_communication` | No (needed to run the contract) | Notices about the customer's own accounts and requests |
| `regulatory_notice` | No (legal duty) | Required disclosures and statements |
| `marketing` | Yes | Offers, campaigns, retention offers |
| `credit_check` | Yes | Credit bureau pulls |
| `insurance_data_sharing` | Yes | Sharing data with a partner insurer |
| `analytics_profiling` | Yes | Segmentation and propensity use beyond service |
| `third_party_sharing` | Yes | Any other disclosure to a third party |
| `whatsapp_updates` | Yes | Messaging on that channel (maps to `bank_preferences.whatsapp_updates`) |

## Rules
1. A consent is **active** when it is not revoked and not expired. Check at the time of use, not at the time of collection.
2. Consent for one purpose never covers another. Marketing consent does not allow a credit pull. Service communication does not allow promotion.
3. A revoked consent stops new use immediately. Past actions stay in the audit trail.
4. Record the `consent_id` relied on in every audit event that depends on consent.
5. If consent is missing, either ask for it (where the process allows) or take the alternative path that does not need the data. Never proceed anyway.

## Personal data classes
| Class | Examples | Handling |
|---|---|---|
| High | Identity numbers, full card or account numbers, biometrics, documents, health declarations, credit reports | Store as hash or encrypted. Mask in all agent output. Never log raw. |
| Medium | Names, contact details, transaction detail, balances, preferences | Use only for the stated purpose. Mask when not needed. |
| Low | Product codes, aggregate counts, anonymised features | Normal handling. |

## Minimisation
`build_customer_context` returns only what the stated purpose needs. If your purpose is "offer selection", you do not need case notes about a bereavement. Ask for a narrower purpose or leave the field out.

## Retention and deletion
Retention periods are set per dataset (`retention_days`). Deletion requests follow [Data Subject Request](../processes/data-subject-request.md). Regulatory retention can override deletion. State what was kept and why.
