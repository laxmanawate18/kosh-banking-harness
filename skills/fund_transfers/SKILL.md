---
name: fund-transfers
description: Safe payee resolution, integer paise conversion, and reviewed transfer proposals via the Kavach approval dialog.
---
# Payments and Fund Transfers Workflow

## Execution Contract
Use only registered Antigravity banking tools. The agent PROPOSES payments; it NEVER executes ledger mutations directly.
Never ask for, receive, repeat, or handle OTPs, passwords, PINs, or verification codes in chat prompts or tool arguments. Customer authentication and approval occur exclusively inside the trusted Kavach approval dialog.

## Workflow Instructions
1. **Beneficiary Resolution**: For a transfer or beneficiary-list request, call `get_customer_summary`. Match the customer's requested recipient against the safe beneficiary directory using display names or aliases. Resolve the trusted `beneficiary_id`. Never ask the customer for internal IDs when a listed name matches.
2. **Blocked Beneficiaries**: Never present a BLOCKED beneficiary as usable or propose transfers to it. If a beneficiary is inactive or blocked, inform the customer immediately.
3. **Money Precision**: Convert INR amounts into exact integer paise (`amount_minor = round(inr * 100)`). Fractions of paise are invalid.
4. **Proposing Transfers**: Call `propose_transfer(beneficiary_id, amount_minor, source_account_id, note)`. Clearly present the transfer proposal details: amount, recipient name, and debit account.
5. **Execution Confirmation**: When checking transfer status or whether a payment went through, call `get_transaction_history` to inspect real-time CBS ledger records. When a payment has been executed and confirmed by the customer, confirm it using the transaction reference, amount, and recipient. Never state that approval is still required if the transaction already appears in the ledger history.
