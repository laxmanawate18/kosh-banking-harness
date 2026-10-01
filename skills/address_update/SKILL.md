---
name: address-update
description: Document-assisted residential address change with review and proof of address.
---
# Address update
## Workflow
Open start_banking_workflow("address_update"). Reuse known account choices, then upload a chosen address document with permission. Extract only facts visible in that document: address, city, state and PIN code; never infer an address from PAN. Prefill suggestions using record_document_extraction. The customer corrects/accepts fields and states the reason. Require selected address proof, account ownership, address completeness and fresh verification. Submit P1-12 for officer review. No profile address changes on submission, and no promised dispatch until the bank confirms.

