---
id: proc.term_deposit_lifecycle
type: process
name: Term Deposit Lifecycle
domain: deposits-operations
version: 0.1.0
status: draft
performed_by: actor.operations_agent
escalates_to: [actor.operations_officer, actor.service_officer]
triggered_by: [evt.deposit_opened, evt.maturity_approaching]
emits: []
uses_activities: [act.check_limits_and_balance, act.post_to_ledger, act.check_consent, act.notify_customer]
governed_by: [pol.authentication_assurance, pol.consent_privacy, pol.audit_evidence]
reads: [obj.account, obj.product, obj.customer]
writes: [obj.term_deposit, obj.transaction, obj.journal_entry]
kosh_status: partial
kosh_channels: [customer]
kosh_tools: [start_banking_workflow]
kosh_skills: [deposit]
kosh_care: []
kosh_services: [P1-18, P1-19, P1-20]
kosh_tables: [banking_workflows, service_requests]
kosh_note: Fixed and recurring deposits are applied for through the deposit form; booking and rates are confirmed by the bank. Premature withdrawal and maturity changes are not available in chat: offer a callback.
---
# Term Deposit Lifecycle

> Opens, accrues, matures and pays out fixed and recurring deposits.

## Use this process when
- fixed deposit
- FD
- recurring deposit
- RD
- maturity
- premature withdrawal

## Do not use it when
- savings or current account: use [Account Opening](account-opening.md)

## Trigger and ownership
- **Triggered by:** [Deposit opened](../events.md#evt.deposit_opened), [Maturity approaching](../events.md#evt.maturity_approaching)
- **Performed by:** [Operations Agent](../actors/agents.md#actor.operations_agent) (autonomy ceiling A3)
- **Escalates to:** [Operations Officer](../actors/humans-and-external.md#actor.operations_officer), [Service Officer](../actors/humans-and-external.md#actor.service_officer)
- **Emits:** none
- **Governed by:** [Authentication Assurance](../policies/authentication-assurance.md), [Consent and Privacy](../policies/consent-and-privacy.md), [Audit and Evidence](../policies/audit-and-evidence.md)

## Flow
Work the steps in order. At each step, open the linked activity file before acting. A step marked conditional is skipped when its condition is false, and the skip is recorded.

| # | Step | Edge | Activities | Performed by | Approval gate | Autonomy | Condition | What happens |
|---|---|---|---|---|---|---|---|---|
| 1 | **Fund** | START | [Check Limits and Balance](../activities/check-limits-and-balance.md), [Post to Ledger](../activities/post-to-ledger.md) | [Operations Agent](../actors/agents.md#actor.operations_agent) | none | A3 | always | Debit the source account and fund the deposit. |
| 2 | **Book** | ACTIVITY | inline | [Operations Agent](../actors/agents.md#actor.operations_agent) | none | A3 | always | Create the deposit with the rate card, tenure and maturity date. |
| 3 | **Accrue Interest** | ACTIVITY | inline | [Operations Agent](../actors/agents.md#actor.operations_agent) | none | A3 | always | Accrue interest in the daily close. |
| 4 | **Capture Maturity Instruction** | ACTIVITY | [Check Consent](../activities/check-consent.md), [Notify Customer](../activities/notify-customer.md) | [Operations Agent](../actors/agents.md#actor.operations_agent) | none | A3 | always | Remind the customer before maturity and record the instruction. Auto-renew needs recorded consent. |
| 5 | **Pay Out or Renew** | ACTIVITY | [Post to Ledger](../activities/post-to-ledger.md) | [Operations Agent](../actors/agents.md#actor.operations_agent) | none | A3 | always | Pay principal and interest or renew per the instruction. |
| 6 | **Close** | FINALIZE | inline | [Operations Agent](../actors/agents.md#actor.operations_agent) | none | A3 | always | Close the deposit and notify. |

## Graph edges
`proc.term_deposit_lifecycle` is the hub. Edges follow the hub-and-spoke pattern: the hub STARTs the first step, has an ACTIVITY edge to each middle step, FINALIZEs the last, and steps chain with NEXT.

```mermaid
graph LR
  H(("Term Deposit Lifecycle"))
  S1["Fund"]
  S2["Book"]
  S3["Accrue Interest"]
  S4["Capture Maturity Instruction"]
  S5["Pay Out or Renew"]
  S6["Close"]
  H -- START --> S1
  H -- ACTIVITY --> S2
  H -- ACTIVITY --> S3
  H -- ACTIVITY --> S4
  H -- ACTIVITY --> S5
  H -- FINALIZE --> S6
  S1 -- NEXT --> S2
  S2 -- NEXT --> S3
  S3 -- NEXT --> S4
  S4 -- NEXT --> S5
  S5 -- NEXT --> S6
```

## Exceptions
| If | Then |
|---|---|
| Premature closure | Show penalty, get explicit confirmation with step-up, then proceed. |
| Lien marked (e.g. loan security) | Block closure until the lien is released. |

## Finalize (done means)
Deposit paid out or renewed correctly with ledger postings.

## Data touched
| Object | Access | Backing tables |
|---|---|---|
| [Account](../objects/accounts-payments.md#obj.account) | reads | `bank_accounts`, `core_account_holders`, `gl_account_balances`, `ret_nominees` |
| [Product](../objects/engagement.md#obj.product) | reads | `core_products`, `core_interest_rates`, `core_fee_schedules`, `los_loan_products`, `ins_products` |
| [Customer](../objects/customer.md#obj.customer) | reads | `bank_customers`, `core_customer_contacts`, `bank_preferences`, `app_users` |
| [Term Deposit](../objects/accounts-payments.md#obj.term_deposit) | writes | `ret_term_deposits` |
| [Transaction](../objects/accounts-payments.md#obj.transaction) | writes | `bank_transactions` |
| [Journal Entry](../objects/accounts-payments.md#obj.journal_entry) | writes | `gl_journal_entries`, `gl_journal_lines`, `gl_posting_rules`, `gl_chart_of_accounts` |

## Evidence emitted
Event types from the activities above (see [Audit and Evidence](../policies/audit-and-evidence.md)): `payment.limits_checked`, `ledger.entry_posted`, `ledger.entry_reversed`, `consent.checked`, `notify.sent`, `notify.failed`.

## Related
- Related processes: [Account Opening](account-opening.md)
- Routing and event map: [routing.md](../routing.md)
