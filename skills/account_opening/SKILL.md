---
name: account-opening
description: Opening another Kosh savings account for a signed-in customer through the secure form, officer review and core-banking entry.
---
# Savings account opening
## Execution contract
Call open_application_form(product_id) with the Kosh savings account the customer chose (search_public_products if they have not chosen). It shows a card; the customer taps "Open the secure form" and fills it in there. Never collect names, numbers, addresses, nominee details or amounts in chat, and never repeat them. Never ask for passwords, OTPs, card secrets or a complete Aadhaar number.

The customer's KYC must already be verified (KYC comes first). If get_kyc_status shows it is not, help them complete KYC first.

Describe what happens accurately: the form needs a quick identity verification, then a Kosh officer reviews the request. Once approved, Kosh's robot enters it into the bank's core banking system (a legacy system with no API) as maker, it is authorised by the core's checker, and the new account appears in the customer's accounts under their existing customer ID. No new login is created. Never promise approval or a time.
