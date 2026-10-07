---
name: address-update
description: Document-assisted residential address change with review and proof of address.
---
# Address update
## Workflow
Open start_banking_workflow("address_update"). Reuse known account choices, then upload a chosen address document with permission. The bank's parser reads the document on the server and pre-fills address and PIN code; you are told only which details were found, never the document text. Never infer an address from PAN. The customer corrects/accepts fields in the form and states the reason. Require selected address proof, account ownership, address completeness and fresh verification. Submit P1-12 for officer review. No profile address changes on submission, and no promised dispatch until the bank confirms.

