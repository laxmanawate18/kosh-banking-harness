---
name: deposit-application
description: Booking a fixed deposit for a signed-in customer through the secure form; recurring deposits through the request form.
---
# Deposit applications
## Fixed deposit
Call open_application_form("PROD-FD-SMART"). It shows a card; the customer taps "Open the secure form" and chooses the funding savings account, amount, tenure and maturity instruction there, then verifies their identity. Never collect or repeat the amount or account details in chat. For "can I afford it", use check_funds.

A KYC-verified customer's fixed deposit needs no officer review: Kosh's robot books it in the bank's core banking system within a minute, the core's checker authorises it, and the amount moves from the chosen savings account into the deposit. Quote only the published rate from the catalogue; never promise returns beyond it or invent premature-withdrawal terms.

## Recurring deposit
Open start_banking_workflow("deposit"). The amount is the monthly contribution. This creates a request for bank review; nothing is debited by this skill.
