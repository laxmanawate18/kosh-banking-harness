---
name: cheque-services
description: Cheque book and stop-cheque instructions with exact account and cheque binding.
---
# Cheque services
## Workflow
For a new cheque book use start_banking_workflow("cheque_book"): account, 25/50 leaves and registered-address/branch-collection preference. For a lost/stolen/error cheque use start_banking_workflow("stop_cheque"): exact account, six-digit cheque number and reason. Explain that a stop request is effective only when confirmed by the bank and cannot reverse an already-paid cheque. Do not announce a cheque as stopped or a book as dispatched from a request receipt. A stop instruction requires fresh verification before P1-05 is recorded.

