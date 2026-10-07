---
id: objfile.accounts
type: object-group
name: Accounts and payments objects
version: 0.1.0
status: draft
---
# Accounts and payments objects

Where money sits and how it moves.

Each object lists its key attributes, lifecycle states, links to other objects (edges) and the database tables that currently back it. Personal-data sensitivity follows [Consent and Privacy](../policies/consent-and-privacy.md).

<a id="obj.account"></a>
## Account
`obj.account`

A deposit or current account with balances, holders and a GL control account.

- **Key attributes:** `account_id`, `account_number`, `type`, `status`, `currency`, `balance_minor`, `available_balance_minor`, `branch`, `dormancy_status`
- **Lifecycle:** pending, active, dormant, frozen, closed
- **Personal data:** high
- **Backing tables:** `bank_accounts`, `core_account_holders`, `gl_account_balances`, `ret_nominees`
- **Links:**
  - `OWNED_BY` [Customer](customer.md#obj.customer) (primary and joint holders)
  - `GOVERNED_BY_PRODUCT` [Product](engagement.md#obj.product)
  - `HAS` [Card](accounts-payments.md#obj.card)
  - `HAS` [Transaction](accounts-payments.md#obj.transaction)
  - `HAS` [Hold](accounts-payments.md#obj.hold)
  - `HAS` [Standing Instruction](accounts-payments.md#obj.standing_instruction)
- **Used in processes:** [Account Opening](../processes/account-opening.md), [Service Case (Control Tower)](../processes/service-case.md), [Payment Authorisation](../processes/payment-authorisation.md), [Fraud and Dispute](../processes/fraud-and-dispute.md), [Card Lifecycle](../processes/card-lifecycle.md), [Term Deposit Lifecycle](../processes/term-deposit-lifecycle.md), [Dormancy and Closure](../processes/dormancy-and-closure.md), [Daily Close (EOD)](../processes/daily-close-eod.md)

<a id="obj.card"></a>
## Card
`obj.card`

A debit or credit card with network, limits and authorisation history.

- **Key attributes:** `card_id`, `type`, `status`, `card_network`, `masked_pan`, `expiry`, `limits`, `is_international`
- **Lifecycle:** requested, issued, active, blocked, replaced, closed
- **Personal data:** high
- **Backing tables:** `bank_cards`, `ret_card_authorizations`, `ret_transaction_limits`
- **Links:**
  - `LINKED_TO` [Account](accounts-payments.md#obj.account)
  - `OWNED_BY` [Customer](customer.md#obj.customer)
  - `AUTHORISES` [Transaction](accounts-payments.md#obj.transaction)
- **Used in processes:** [Account Opening](../processes/account-opening.md), [Fraud and Dispute](../processes/fraud-and-dispute.md), [Card Lifecycle](../processes/card-lifecycle.md), [Dormancy and Closure](../processes/dormancy-and-closure.md)

<a id="obj.beneficiary"></a>
## Beneficiary
`obj.beneficiary`

A saved payee with risk status and a cooling-off period.

- **Key attributes:** `beneficiary_id`, `kind`, `masked_account`, `risk_status`, `added_at`
- **Lifecycle:** pending, active, restricted, removed
- **Personal data:** high
- **Backing tables:** `bank_beneficiaries`
- **Links:**
  - `SAVED_BY` [Customer](customer.md#obj.customer)
  - `RECEIVES` [Payment](accounts-payments.md#obj.payment)
- **Used in processes:** [Payment Authorisation](../processes/payment-authorisation.md), [Beneficiary Addition](../processes/beneficiary-addition.md)

<a id="obj.transaction"></a>
## Transaction
`obj.transaction`

A posted movement on an account. Immutable once posted.

- **Key attributes:** `transaction_id`, `account_id`, `amount_minor`, `category`, `status`, `value_date`, `channel`, `running_balance_minor`
- **Lifecycle:** pending, posted, reversed
- **Personal data:** medium
- **Backing tables:** `bank_transactions`
- **Links:**
  - `POSTED_AS` [Journal Entry](accounts-payments.md#obj.journal_entry)
  - `ON` [Account](accounts-payments.md#obj.account)
- **Used in processes:** [Service Case (Control Tower)](../processes/service-case.md), [Payment Authorisation](../processes/payment-authorisation.md), [Fraud and Dispute](../processes/fraud-and-dispute.md), [Term Deposit Lifecycle](../processes/term-deposit-lifecycle.md), [Dormancy and Closure](../processes/dormancy-and-closure.md), [Daily Close (EOD)](../processes/daily-close-eod.md), [AML Alert Investigation](../processes/aml-alert-investigation.md)

<a id="obj.payment"></a>
## Payment
`obj.payment`

A request to move money, with its risk decision, step-up challenge and rail messages.

- **Key attributes:** `payment_intent_id`, `action`, `status`, `rail`, `value_date`, `fee_minor`, `end_to_end_ref`, `policy_version`
- **Lifecycle:** initiated, authenticated, approved, held, sent, settled, failed, blocked
- **Personal data:** high
- **Backing tables:** `bank_payment_intents`, `bank_challenges`, `bank_sentinel_decisions`, `core_payment_messages`, `bank_idempotency`
- **Links:**
  - `PAYS` [Beneficiary](accounts-payments.md#obj.beneficiary)
  - `DEBITS` [Account](accounts-payments.md#obj.account)
  - `CREATES` [Transaction](accounts-payments.md#obj.transaction)
  - `RESERVES` [Hold](accounts-payments.md#obj.hold)
  - `DECIDED_BY` [Model](governance-and-data.md#obj.model) (risk model and policy version)
- **Used in processes:** [Payment Authorisation](../processes/payment-authorisation.md)

<a id="obj.hold"></a>
## Hold
`obj.hold`

A reservation that reduces available balance: card authorisation, legal, lien, pending payment.

- **Key attributes:** `hold_type`, `amount_minor`, `status`, `placed_at`, `expires_at`
- **Lifecycle:** active, released, captured, expired
- **Personal data:** none
- **Backing tables:** `gl_holds`
- **Links:**
  - `RESERVES_FUNDS_ON` [Account](accounts-payments.md#obj.account)
- **Used in processes:** [Payment Authorisation](../processes/payment-authorisation.md)

<a id="obj.journal_entry"></a>
## Journal Entry
`obj.journal_entry`

A balanced double-entry posting to the general ledger. Never edited; corrected by reversal.

- **Key attributes:** `entry_no`, `entry_type`, `source_system`, `business_date`, `total_amount_minor`, `status`, `reversal_of`
- **Lifecycle:** draft, posted, reversed
- **Personal data:** none
- **Backing tables:** `gl_journal_entries`, `gl_journal_lines`, `gl_posting_rules`, `gl_chart_of_accounts`
- **Links:**
  - `POSTS_TO` [Account](accounts-payments.md#obj.account) (customer sub-ledger lines)
  - `BELONGS_TO_PERIOD` [Regulatory Report](governance-and-data.md#obj.regulatory_report) (feeds reports)
- **Used in processes:** [Payment Authorisation](../processes/payment-authorisation.md), [Fraud and Dispute](../processes/fraud-and-dispute.md), [Term Deposit Lifecycle](../processes/term-deposit-lifecycle.md), [Daily Close (EOD)](../processes/daily-close-eod.md), [Regulatory Reporting](../processes/regulatory-reporting.md)

<a id="obj.standing_instruction"></a>
## Standing Instruction
`obj.standing_instruction`

A recurring mandate: transfer, bill pay, EMI, premium or recurring deposit.

- **Key attributes:** `instruction_type`, `amount_minor`, `frequency`, `next_run_date`, `status`, `mandate_ref`
- **Lifecycle:** active, paused, cancelled, completed, failed
- **Personal data:** medium
- **Backing tables:** `ret_standing_instructions`
- **Links:**
  - `DEBITS` [Account](accounts-payments.md#obj.account)
  - `PAYS` [Beneficiary](accounts-payments.md#obj.beneficiary)
- **Used in processes:** [Dormancy and Closure](../processes/dormancy-and-closure.md), [Daily Close (EOD)](../processes/daily-close-eod.md), [Insurance Sale](../processes/insurance-sale.md)

<a id="obj.term_deposit"></a>
## Term Deposit
`obj.term_deposit`

A fixed or recurring deposit with rate, maturity and payout instruction.

- **Key attributes:** `deposit_type`, `principal_minor`, `rate_pct`, `maturity_date`, `maturity_instruction`, `auto_renew`, `status`
- **Lifecycle:** active, matured, closed, premature_closed
- **Personal data:** medium
- **Backing tables:** `ret_term_deposits`
- **Links:**
  - `HELD_IN` [Account](accounts-payments.md#obj.account)
  - `PRICED_BY` [Product](engagement.md#obj.product)
- **Used in processes:** [Term Deposit Lifecycle](../processes/term-deposit-lifecycle.md)
