---
id: act.place_balance_hold
type: activity
name: Place Balance Hold
version: 0.1.0
status: draft
skill_id: act.place_balance_hold
performed_by: [actor.payments_agent, actor.operations_agent]
approval_gate: none
approval_when: n/a
autonomy: A3
governed_by: [pol.audit_evidence]
reads: [obj.account]
writes: [obj.hold]
evidence: [ledger.hold_placed, ledger.hold_released]
---
# Place Balance Hold

> Reserve funds so they cannot be spent twice while a payment or authorisation completes.

## Inputs
- account
- amount
- reason and reference

## Outputs
- hold id
- updated available balance

## Rules
- Holds are reversible and MUST carry a reference to the originating record.

## If it fails
If the hold cannot be placed, stop the payment. Holds auto-expire; release explicitly on failure.

## Authority
- **Autonomy:** A3 (Act within limits). Agent executes alone inside policy limits and parameters; every action is audited; anything outside limits escalates.
- **Approval gate:** none
- **May be performed by:** [Payments and Cards Agent](../actors/agents.md#actor.payments_agent), [Operations Agent](../actors/agents.md#actor.operations_agent)
- **Governed by:** [Audit and Evidence](../policies/audit-and-evidence.md)

## Data
- **Reads:** [Account](../objects/accounts-payments.md#obj.account)
- **Writes:** [Hold](../objects/accounts-payments.md#obj.hold)
- **Backing tables:** `gl_holds`

## Evidence
Emit: `ledger.hold_placed`, `ledger.hold_released`. Shape and rules: [Audit and Evidence](../policies/audit-and-evidence.md).

## Used by
- [Payment Authorisation](../processes/payment-authorisation.md), step "Place Hold"
