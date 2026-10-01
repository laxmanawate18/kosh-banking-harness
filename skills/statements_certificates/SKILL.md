---
name: statements-certificates
description: Exact account statements and tax/interest certificate requests.
---
# Statements and certificates
## Workflow
Use start_banking_workflow("statement") for an immediate CSV containing recorded transactions. Ask for account and date range in the form; at most 366 days, no future dates. The trusted download uses owned account data, not model-generated transactions. Never invent balances or tax totals.
Use start_banking_workflow("certificate") for TDS or interest certificates. Select account, certificate type and financial year (YYYY-YYYY). Customer confirmation creates a tracked P1-21 or P1-22 request. A request is not a tax certificate and the agent may not certify tax compliance.

