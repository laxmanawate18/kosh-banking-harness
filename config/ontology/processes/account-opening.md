---
id: proc.account_opening
type: process
name: Account Opening
domain: customer-lifecycle
version: 0.1.0
status: draft
performed_by: actor.onboarding_agent
escalates_to: [actor.compliance_officer, actor.service_officer]
triggered_by: [evt.application_submitted]
emits: [evt.account_opened]
uses_activities: [act.check_consent, act.verify_identity, act.screen_sanctions_pep, act.risk_rate_customer, act.pull_credit_bureau, act.authenticate_step_up, act.notify_customer]
governed_by: [pol.consent_privacy, pol.agent_guardrails, pol.authentication_assurance, pol.approval_matrix, pol.audit_evidence]
reads: [obj.customer, obj.document, obj.product, obj.consent]
writes: [obj.customer, obj.kyc_record, obj.account, obj.card, obj.alert]
kosh_status: implemented
kosh_channels: [customer, visitor, officer]
kosh_tools: [start_account_opening, start_banking_workflow, check_account_opening_status, record_document_extraction, validate_kyc_document, start_video_kyc, open_application_form, check_application_status, get_request_details, draft_decision_note]
kosh_skills: [account_opening]
kosh_care: []
kosh_services: [P1-25]
kosh_tables: [banking_workflows, documents, service_requests, approval_actions, ekyc_sessions, cross_sell_leads, bank_customers, bank_accounts]
kosh_note: Customers open a savings account through the guided form; visitors apply through the secure application form. An officer verifies and approves, then the bank's robot enters it in core banking. You never verify identity, screen or approve.
---
# Account Opening

> Takes a prospect from application to an active account, debit card and digital access.

## Use this process when
- open an account
- new savings or current account
- sign up as a customer
- onboard a new customer

## Do not use it when
- loan or credit request: use [Loan Origination](loan-origination.md)
- fixed or recurring deposit: use [Term Deposit Lifecycle](term-deposit-lifecycle.md)
- refresh KYC of an existing customer: use [Perpetual KYC](perpetual-kyc.md)

## Trigger and ownership
- **Triggered by:** [Application submitted](../events.md#evt.application_submitted)
- **Performed by:** [Onboarding Agent](../actors/agents.md#actor.onboarding_agent) (autonomy ceiling A3)
- **Escalates to:** [Compliance Officer](../actors/humans-and-external.md#actor.compliance_officer), [Service Officer](../actors/humans-and-external.md#actor.service_officer)
- **Emits:** [Account opened](../events.md#evt.account_opened)
- **Governed by:** [Consent and Privacy](../policies/consent-and-privacy.md), [Agent Guardrails](../policies/agent-guardrails.md), [Authentication Assurance](../policies/authentication-assurance.md), [Approval Matrix](../policies/approval-matrix.md), [Audit and Evidence](../policies/audit-and-evidence.md)

## Flow
Work the steps in order. At each step, open the linked activity file before acting. A step marked conditional is skipped when its condition is false, and the skip is recorded.

| # | Step | Edge | Activities | Performed by | Approval gate | Autonomy | Condition | What happens |
|---|---|---|---|---|---|---|---|---|
| 1 | **Onboarding** | START | [Check Consent](../activities/check-consent.md) | [Onboarding Agent](../actors/agents.md#actor.onboarding_agent) | none | A3 | always | Capture applicant details, product choice, nominee and consents. Create the application record and a prospect customer. |
| 2 | **Verify Identity** | ACTIVITY | [Verify Identity](../activities/verify-identity.md) | [Onboarding Agent](../actors/agents.md#actor.onboarding_agent) | none | A3 | always | Verify identity by eKYC or documents. |
| 3 | **Check Compliance** | ACTIVITY | [Screen Sanctions and PEP](../activities/screen-sanctions-pep.md), [Risk-Rate Customer](../activities/risk-rate-customer.md) | [Onboarding Agent](../actors/agents.md#actor.onboarding_agent) | [Compliance Officer](../actors/humans-and-external.md#actor.compliance_officer) (only when a potential screening match or a high-risk rating) | A3; A2 when gated | always | Screen sanctions and PEP, then rate risk. A potential match or high rating goes to the compliance officer. |
| 4 | **Check Credit History** | ACTIVITY | [Pull Credit Bureau](../activities/pull-credit-bureau.md) | [Onboarding Agent](../actors/agents.md#actor.onboarding_agent) | none | A3 | Only if the product has a credit feature (overdraft, credit card). | Pull bureau data with credit_check consent. |
| 5 | **Create Account** | ACTIVITY | inline | [Onboarding Agent](../actors/agents.md#actor.onboarding_agent) | none | A3 | always | Create the customer record if new, open the account under the product, branch, rate card and GL control account, and set holders. |
| 6 | **Register Nominee** | ACTIVITY | inline | [Onboarding Agent](../actors/agents.md#actor.onboarding_agent) | none | A3 | always | Record nominee details and shares. Guardian required for a minor nominee. |
| 7 | **Issue Debit Card** | ACTIVITY | inline | [Onboarding Agent](../actors/agents.md#actor.onboarding_agent) | none | A3 | always | Request a debit card linked to the account with default limits. |
| 8 | **Activate Digital Banking** | ACTIVITY | [Authenticate (Step-Up)](../activities/authenticate-step-up.md) | [Onboarding Agent](../actors/agents.md#actor.onboarding_agent) | none | A3 | always | Create app login and bind the customer's device. |
| 9 | **Order Checks** | FINALIZE | [Notify Customer](../activities/notify-customer.md) | [Onboarding Agent](../actors/agents.md#actor.onboarding_agent) | none | A3 | always | Order a chequebook if requested, send the welcome notice and emit account_opened. |

## Graph edges
`proc.account_opening` is the hub. Edges follow the hub-and-spoke pattern: the hub STARTs the first step, has an ACTIVITY edge to each middle step, FINALIZEs the last, and steps chain with NEXT.

```mermaid
graph LR
  H(("Account Opening"))
  S1["Onboarding"]
  S2["Verify Identity"]
  S3["Check Compliance"]
  S4["Check Credit History"]
  S5["Create Account"]
  S6["Register Nominee"]
  S7["Issue Debit Card"]
  S8["Activate Digital Banking"]
  S9["Order Checks"]
  H -- START --> S1
  H -- ACTIVITY --> S2
  H -- ACTIVITY --> S3
  H -- ACTIVITY --> S4
  H -- ACTIVITY --> S5
  H -- ACTIVITY --> S6
  H -- ACTIVITY --> S7
  H -- ACTIVITY --> S8
  H -- FINALIZE --> S9
  S1 -- NEXT --> S2
  S2 -- NEXT --> S3
  S3 -- NEXT --> S4
  S4 -- NEXT --> S5
  S5 -- NEXT --> S6
  S6 -- NEXT --> S7
  S7 -- NEXT --> S8
  S8 -- NEXT --> S9
```

## Exceptions
| If | Then |
|---|---|
| Identity verification fails | Route to manual review. Do not continue to compliance until resolved. |
| Confirmed or potential sanctions match | Stop. Escalate to the compliance officer. Tell the customer only that the application needs more review (no tipping off). |
| High risk rating | Require enhanced due diligence and compliance officer approval before Create Account. |
| Applicant abandons | Expire the application after the configured number of days and delete uncommitted documents per retention rules. |

## Finalize (done means)
Account is active, card issued, nominee recorded, welcome sent and outcome stored.

## Data touched
| Object | Access | Backing tables |
|---|---|---|
| [Customer](../objects/customer.md#obj.customer) | reads and writes | `bank_customers`, `core_customer_contacts`, `bank_preferences`, `app_users` |
| [Document](../objects/customer.md#obj.document) | reads | `documents`, `los_application_documents`, `ins_claim_documents`, `ret_statements` |
| [Product](../objects/engagement.md#obj.product) | reads | `core_products`, `core_interest_rates`, `core_fee_schedules`, `los_loan_products`, `ins_products` |
| [Consent](../objects/customer.md#obj.consent) | reads | `consents`, `bank_preferences` |
| [KYC Record](../objects/customer.md#obj.kyc_record) | writes | `core_kyc_records`, `ekyc_sessions` |
| [Account](../objects/accounts-payments.md#obj.account) | writes | `bank_accounts`, `core_account_holders`, `gl_account_balances`, `ret_nominees` |
| [Card](../objects/accounts-payments.md#obj.card) | writes | `bank_cards`, `ret_card_authorizations`, `ret_transaction_limits` |
| [Alert](../objects/service-and-risk.md#obj.alert) | writes | `core_aml_alerts`, `bank_security_alerts` |

## Evidence emitted
Event types from the activities above (see [Audit and Evidence](../policies/audit-and-evidence.md)): `consent.checked`, `kyc.identity_verified`, `kyc.identity_failed`, `kyc.identity_manual_review`, `aml.screening_clear`, `aml.screening_potential_match`, `aml.screening_confirmed_match`, `kyc.risk_rated`, `credit.bureau_pulled`, `auth.step_up_passed`, `auth.step_up_failed`, `auth.step_up_locked`, `notify.sent`, `notify.failed`.

## Related
- Related processes: [Loan Origination](loan-origination.md), [Term Deposit Lifecycle](term-deposit-lifecycle.md), [Perpetual KYC](perpetual-kyc.md)
- Routing and event map: [routing.md](../routing.md)
