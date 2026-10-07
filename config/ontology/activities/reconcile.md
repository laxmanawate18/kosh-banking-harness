---
id: act.reconcile
type: activity
name: Reconcile
version: 0.1.0
status: draft
skill_id: act.reconcile
performed_by: [actor.operations_agent, actor.reporting_agent]
approval_gate: actor.finance_ops
approval_when: breaks are found
autonomy: A3
governed_by: [pol.audit_evidence]
reads: [obj.journal_entry]
writes: [obj.journal_entry]
evidence: [recon.completed, recon.break_found]
---
# Reconcile

> Match two sources (ledger vs sub-ledger, ledger vs external statement) and list breaks.

## Inputs
- two sources and the business date or statement

## Outputs
- matched, unmatched and break lists
- reconciliation run id

## Rules
- The agent MUST NOT post correcting entries. It proposes them for finance operations.

## If it fails
Breaks are listed, not auto-fixed. Aged breaks escalate to finance operations.

## Authority
- **Autonomy:** A3 (Act within limits). Agent executes alone inside policy limits and parameters; every action is audited; anything outside limits escalates.
- **Approval gate:** [Finance Operations](../actors/humans-and-external.md#actor.finance_ops) only when breaks are found
- **May be performed by:** [Operations Agent](../actors/agents.md#actor.operations_agent), [Reporting Agent](../actors/agents.md#actor.reporting_agent)
- **Governed by:** [Audit and Evidence](../policies/audit-and-evidence.md)

## Data
- **Reads:** [Journal Entry](../objects/accounts-payments.md#obj.journal_entry)
- **Writes:** [Journal Entry](../objects/accounts-payments.md#obj.journal_entry)
- **Backing tables:** `gl_recon_runs`, `gl_recon_items`

## Evidence
Emit: `recon.completed`, `recon.break_found`. Shape and rules: [Audit and Evidence](../policies/audit-and-evidence.md).

## Used by
- [Daily Close (EOD)](../processes/daily-close-eod.md), step "Reconcile"
- [Regulatory Reporting](../processes/regulatory-reporting.md), step "Reconcile to Ledger"
