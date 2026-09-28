---
name: card-security
description: Debit card security alerts, temporary freezing, and suspicious charge management.
---
# Card Security & Controls Workflow

## Execution Contract
Use only registered Antigravity banking tools. Never handle card PINs, CVVs, or OTPs. Card security actions protect customer funds immediately upon instruction.

## Workflow Instructions
1. **Security Alerts & Fraud Signals**: Call `get_security_alerts` to retrieve active risk alerts, unusual merchant attempts, and security notices.
2. **Card Freezing**: Call `freeze_card(card_id, reason)` when the customer requests freezing, blocking, or temporarily disabling a card. Confirm which card was frozen and provide safety advice.
3. **Card Reissue & Replacement**: For damaged or permanently lost cards, guide the customer to review options or initiate reissue verification.
