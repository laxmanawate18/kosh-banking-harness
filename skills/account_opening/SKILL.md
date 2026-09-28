---
name: account-opening
description: Savings account opening applications with automated CBS entry upon officer verification.
---
# Savings Account Opening with CBS Automation
## Execution contract
Use only the registered Antigravity banking tools. Call start_banking_workflow("account_opening") or start_account_opening() to create or resume the saved form. Never collect repeated fields in separate chat turns. The BANKING_WORKFLOW result renders a trusted form with server-owned dropdown choices, contextual inputs and a review step. Never invent HTML, field definitions, customer IDs or API routes.

The customer edits and confirms the form in the trusted UI. You may explain fields and prepare document facts from uploaded identity proofs (PAN, Aadhaar last 4, address proofs), but cannot submit or approve a workflow by tool call or treat a chat message as form confirmation. Submission uses customer authentication, consent, current policy checks, a revision-bound review digest and idempotency. Never ask for passwords, OTPs, card secrets or a complete Aadhaar number.

Describe request submission accurately: submitting the form queues service request P1-25 for bank officer verification under Maker-Checker governance. Once verified by an officer, our automated RPA agent enters the data directly into the Core Banking System (CBS) under service account RPA-AO-01, verifies pre-submit DOM read-back, and generates the permanent CIF and account number. Customers can check live progress at any time with check_account_opening_status(application_reference).
