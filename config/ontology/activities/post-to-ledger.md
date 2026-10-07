---
id: act.post_to_ledger
type: activity
name: Post to Ledger
version: 0.1.0
status: draft
skill_id: act.post_to_ledger
performed_by: [actor.system_batch]
approval_gate: actor.finance_ops
approval_when: an adjustment or correction is requested (agents only propose it)
autonomy: A3
governed_by: [pol.audit_evidence]
reads: [obj.account, obj.journal_entry]
writes: [obj.journal_entry, obj.transaction]
evidence: [ledger.entry_posted, ledger.entry_reversed]
---
# Post to Ledger

> Create a balanced, idempotent journal entry through the posting engine.

## Inputs
- business event and posting rule code
- amount and currency
- idempotency key

## Outputs
- journal entry id
- transaction records

## Rules
- Agents NEVER write balances directly. Only the posting engine posts.
- Posted entries are immutable. Corrections are reversals with a link to the original.
- An idempotency key is REQUIRED so retries do not double-post.

## If it fails
An unbalanced entry is rejected as a whole. Posting failures halt the business date for the affected feed and go to operations.

## Authority
- **Autonomy:** A3 (Act within limits). Agent executes alone inside policy limits and parameters; every action is audited; anything outside limits escalates.
- **Approval gate:** [Finance Operations](../actors/humans-and-external.md#actor.finance_ops) only when an adjustment or correction is requested (agents only propose it)
- **May be performed by:** [Batch / Posting Engine](../actors/humans-and-external.md#actor.system_batch)
- **Governed by:** [Audit and Evidence](../policies/audit-and-evidence.md)

## Data
- **Reads:** [Account](../objects/accounts-payments.md#obj.account), [Journal Entry](../objects/accounts-payments.md#obj.journal_entry)
- **Writes:** [Journal Entry](../objects/accounts-payments.md#obj.journal_entry), [Transaction](../objects/accounts-payments.md#obj.transaction)
- **Backing tables:** `gl_journal_entries`, `gl_journal_lines`, `gl_posting_rules`, `bank_transactions`

## Evidence
Emit: `ledger.entry_posted`, `ledger.entry_reversed`. Shape and rules: [Audit and Evidence](../policies/audit-and-evidence.md).

## Used by
- [Loan Origination](../processes/loan-origination.md), step "Disburse"
- [Payment Authorisation](../processes/payment-authorisation.md), step "Post to Ledger"
- [Fraud and Dispute](../processes/fraud-and-dispute.md), step "Provisional Credit"
- [Term Deposit Lifecycle](../processes/term-deposit-lifecycle.md), step "Fund"
- [Term Deposit Lifecycle](../processes/term-deposit-lifecycle.md), step "Pay Out or Renew"
- [Dormancy and Closure](../processes/dormancy-and-closure.md), step "Settle Balance"
- [Daily Close (EOD)](../processes/daily-close-eod.md), step "Accrue Interest"
- [Daily Close (EOD)](../processes/daily-close-eod.md), step "Post Fees"
- [Daily Close (EOD)](../processes/daily-close-eod.md), step "Run EMI Debits"
- [Claim Assistance](../processes/claim-assistance.md), step "Settle"
