---
id: act.check_limits_and_balance
type: activity
name: Check Limits and Balance
version: 0.1.0
status: draft
skill_id: act.check_limits_and_balance
performed_by: [actor.payments_agent, actor.operations_agent]
approval_gate: none
approval_when: n/a
autonomy: A3
governed_by: [pol.approval_matrix, pol.audit_evidence]
reads: [obj.account, obj.card]
writes: []
evidence: [payment.limits_checked]
---
# Check Limits and Balance

> Check that the account, channel and amount are within balance, available funds and configured limits.

## Inputs
- account
- amount and currency
- channel

## Outputs
- allow or deny with reason
- available balance used

## Rules
- Available balance MUST account for active holds.
- Customers may lower their own limits freely. Raising limits requires step-up.

## If it fails
Deny with a clear reason. Never partially execute. Offer to raise the limit only through step-up.

## Authority
- **Autonomy:** A3 (Act within limits). Agent executes alone inside policy limits and parameters; every action is audited; anything outside limits escalates.
- **Approval gate:** none
- **May be performed by:** [Payments and Cards Agent](../actors/agents.md#actor.payments_agent), [Operations Agent](../actors/agents.md#actor.operations_agent)
- **Governed by:** [Approval Matrix](../policies/approval-matrix.md), [Audit and Evidence](../policies/audit-and-evidence.md)

## Data
- **Reads:** [Account](../objects/accounts-payments.md#obj.account), [Card](../objects/accounts-payments.md#obj.card)
- **Writes:** none
- **Backing tables:** `bank_accounts`, `gl_account_balances`, `ret_transaction_limits`

## Evidence
Emit: `payment.limits_checked`. Shape and rules: [Audit and Evidence](../policies/audit-and-evidence.md).

## Used by
- [Payment Authorisation](../processes/payment-authorisation.md), step "Check Limits and Balance"
- [Card Lifecycle](../processes/card-lifecycle.md), step "Set Limits"
- [Term Deposit Lifecycle](../processes/term-deposit-lifecycle.md), step "Fund"
- [Dormancy and Closure](../processes/dormancy-and-closure.md), step "Clear Dues and Holds"
