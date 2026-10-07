---
id: routing
type: router
name: Task Routing
version: 0.1.0
status: draft
---
# Task Routing

Use this file first. Match the task to a process, then open that process file. Match on meaning, not exact words.

## 1. By task

| If the task is about | Open process | Domain |
|---|---|---|
| open an account; new savings or current account; sign up as a customer; onboard a new customer | [Account Opening](processes/account-opening.md) | customer-lifecycle |
| refresh KYC; periodic review; re-verify a customer; risk rating changed; adverse media on a customer | [Perpetual KYC](processes/perpetual-kyc.md) | customer-lifecycle |
| recommend a product; next best offer; cross-sell or up-sell; welcome offer; send a personalised offer | [Next Best Offer](processes/next-best-offer.md) | sales-marketing |
| customer might leave; churn risk; retention; closing intent; win back | [Churn Retention](processes/churn-retention.md) | sales-marketing |
| customer has a problem; complaint; service request; case status; SLA breach; grievance | [Service Case (Control Tower)](processes/service-case.md) | customer-service |
| change phone number; change email; update address; update mobile | [Contact Detail Change](processes/contact-detail-change.md) | customer-service |
| apply for a loan; apply for a personal loan; apply for a home loan; loan eligibility; sanction; disburse | [Loan Origination](processes/loan-origination.md) | lending |
| missed EMI; overdue loan; collections; promise to pay; restructure a loan | [Collections](processes/collections.md) | lending |
| send money; transfer; pay a bill; make a payment; NEFT; UPI; IMPS | [Payment Authorisation](processes/payment-authorisation.md) | payments-cards |
| unauthorised transaction; I did not make this payment; fraud; card stolen; chargeback; dispute a transaction | [Fraud and Dispute](processes/fraud-and-dispute.md) | payments-cards |
| new card; replace card; block card; card limit; activate card; lost card | [Card Lifecycle](processes/card-lifecycle.md) | payments-cards |
| add a payee; add beneficiary; new recipient; save a payee; new payee | [Beneficiary Addition](processes/beneficiary-addition.md) | payments-cards |
| fixed deposit; FD; recurring deposit; RD; maturity; premature withdrawal | [Term Deposit Lifecycle](processes/term-deposit-lifecycle.md) | deposits-operations |
| close my account; dormant account; inactive account; reactivate account; account closure | [Dormancy and Closure](processes/dormancy-and-closure.md) | deposits-operations |
| end of day; EOD; day close; trial balance; accrual run; business date roll | [Daily Close (EOD)](processes/daily-close-eod.md) | deposits-operations |
| AML alert; suspicious transaction; STR; SAR; structuring; sanctions alert | [AML Alert Investigation](processes/aml-alert-investigation.md) | compliance-risk |
| regulatory report; regulator submission; return filing; report period; BCBS 239 | [Regulatory Reporting](processes/regulatory-reporting.md) | compliance-risk |
| approve an agent action; agent wants to; needs approval; human in the loop | [Agent Action Approval](processes/agent-action-approval.md) | governance-ai |
| new model; model approval; model drift; retire a model; model monitoring | [Model Lifecycle](processes/model-lifecycle.md) | governance-ai |
| delete my data; access my data; right to erasure; data export; correct my data; privacy request | [Data Subject Request](processes/data-subject-request.md) | governance-ai |
| buy insurance; term life; health insurance; insurance quote; bancassurance; policy purchase | [Insurance Sale](processes/insurance-sale.md) | insurance |
| file a claim; insurance claim; claim status; hospitalisation claim; death claim | [Claim Assistance](processes/claim-assistance.md) | insurance |
| new data source; publish a dataset; onboard data; ingest; data pipeline | [Data Product Publication](processes/data-product-publication.md) | data-estate |

## 2. By event

| Event | Open process |
|---|---|
| [Application submitted](events.md#evt.application_submitted) | [Account Opening](processes/account-opening.md) |
| [Account opened](events.md#evt.account_opened) | [Next Best Offer](processes/next-best-offer.md) |
| [KYC review due](events.md#evt.kyc_review_due) | [Perpetual KYC](processes/perpetual-kyc.md) |
| [Customer profile changed](events.md#evt.profile_changed) | [Perpetual KYC](processes/perpetual-kyc.md) |
| [Adverse media hit](events.md#evt.adverse_media_hit) | [Perpetual KYC](processes/perpetual-kyc.md) |
| [Customer signal](events.md#evt.customer_signal) | [Next Best Offer](processes/next-best-offer.md) |
| [Churn signal](events.md#evt.churn_signal) | [Churn Retention](processes/churn-retention.md) |
| [Case received](events.md#evt.case_received) | [Service Case (Control Tower)](processes/service-case.md) |
| [Contact change requested](events.md#evt.contact_change_requested) | [Contact Detail Change](processes/contact-detail-change.md) |
| [Loan requested](events.md#evt.loan_requested) | [Loan Origination](processes/loan-origination.md) |
| [Loan disbursed](events.md#evt.loan_disbursed) | [Collections](processes/collections.md) |
| [EMI missed](events.md#evt.emi_missed) | [Collections](processes/collections.md) |
| [Payment requested](events.md#evt.payment_requested) | [Payment Authorisation](processes/payment-authorisation.md) |
| [Suspicious activity](events.md#evt.suspicious_activity) | [Fraud and Dispute](processes/fraud-and-dispute.md) |
| [Card requested](events.md#evt.card_requested) | [Card Lifecycle](processes/card-lifecycle.md) |
| [Beneficiary add requested](events.md#evt.beneficiary_add_requested) | [Beneficiary Addition](processes/beneficiary-addition.md) |
| [Deposit opened](events.md#evt.deposit_opened) | [Term Deposit Lifecycle](processes/term-deposit-lifecycle.md) |
| [Maturity approaching](events.md#evt.maturity_approaching) | [Term Deposit Lifecycle](processes/term-deposit-lifecycle.md) |
| [Inactivity threshold reached](events.md#evt.inactivity_threshold) | [Dormancy and Closure](processes/dormancy-and-closure.md) |
| [Closure requested](events.md#evt.closure_requested) | [Dormancy and Closure](processes/dormancy-and-closure.md) |
| [Business date end](events.md#evt.business_date_end) | [Daily Close (EOD)](processes/daily-close-eod.md) |
| [AML alert raised](events.md#evt.aml_alert_raised) | [AML Alert Investigation](processes/aml-alert-investigation.md) |
| [Reporting period end](events.md#evt.reporting_period_end) | [Regulatory Reporting](processes/regulatory-reporting.md) |
| [Agent action proposed](events.md#evt.agent_action_proposed) | [Agent Action Approval](processes/agent-action-approval.md) |
| [Model change proposed](events.md#evt.model_change_proposed) | [Model Lifecycle](processes/model-lifecycle.md) |
| [Data subject request received](events.md#evt.dsr_received) | [Data Subject Request](processes/data-subject-request.md) |
| [Insurance lead](events.md#evt.insurance_lead) | [Insurance Sale](processes/insurance-sale.md) |
| [Claim intimated](events.md#evt.claim_intimated) | [Claim Assistance](processes/claim-assistance.md) |
| [New data source](events.md#evt.new_data_source) | [Data Product Publication](processes/data-product-publication.md) |

## 3. Easily confused

| If you are about to use | but the task is | use instead |
|---|---|---|
| [Account Opening](processes/account-opening.md) | loan or credit request | [Loan Origination](processes/loan-origination.md) |
| [Account Opening](processes/account-opening.md) | fixed or recurring deposit | [Term Deposit Lifecycle](processes/term-deposit-lifecycle.md) |
| [Account Opening](processes/account-opening.md) | refresh KYC of an existing customer | [Perpetual KYC](processes/perpetual-kyc.md) |
| [Perpetual KYC](processes/perpetual-kyc.md) | new customer onboarding | [Account Opening](processes/account-opening.md) |
| [Perpetual KYC](processes/perpetual-kyc.md) | AML alert on a transaction | [AML Alert Investigation](processes/aml-alert-investigation.md) |
| [Next Best Offer](processes/next-best-offer.md) | customer is leaving | [Churn Retention](processes/churn-retention.md) |
| [Next Best Offer](processes/next-best-offer.md) | customer wants a loan now | [Loan Origination](processes/loan-origination.md) |
| [Next Best Offer](processes/next-best-offer.md) | customer wants insurance now | [Insurance Sale](processes/insurance-sale.md) |
| [Churn Retention](processes/churn-retention.md) | customer already asked to close the account | [Dormancy and Closure](processes/dormancy-and-closure.md) |
| [Churn Retention](processes/churn-retention.md) | general complaint | [Service Case (Control Tower)](processes/service-case.md) |
| [Service Case (Control Tower)](processes/service-case.md) | card or payment fraud | [Fraud and Dispute](processes/fraud-and-dispute.md) |
| [Service Case (Control Tower)](processes/service-case.md) | change phone or email | [Contact Detail Change](processes/contact-detail-change.md) |
| [Service Case (Control Tower)](processes/service-case.md) | close account | [Dormancy and Closure](processes/dormancy-and-closure.md) |
| [Contact Detail Change](processes/contact-detail-change.md) | suspected takeover | [Fraud and Dispute](processes/fraud-and-dispute.md) |
| [Loan Origination](processes/loan-origination.md) | customer is behind on payments | [Collections](processes/collections.md) |
| [Loan Origination](processes/loan-origination.md) | overdraft on a new account | [Account Opening](processes/account-opening.md) |
| [Collections](processes/collections.md) | loan application | [Loan Origination](processes/loan-origination.md) |
| [Payment Authorisation](processes/payment-authorisation.md) | add a new payee | [Beneficiary Addition](processes/beneficiary-addition.md) |
| [Payment Authorisation](processes/payment-authorisation.md) | unauthorised payment | [Fraud and Dispute](processes/fraud-and-dispute.md) |
| [Fraud and Dispute](processes/fraud-and-dispute.md) | wrong beneficiary typed by customer | [Service Case (Control Tower)](processes/service-case.md) |
| [Card Lifecycle](processes/card-lifecycle.md) | fraud on the card | [Fraud and Dispute](processes/fraud-and-dispute.md) |
| [Beneficiary Addition](processes/beneficiary-addition.md) | pay an existing payee | [Payment Authorisation](processes/payment-authorisation.md) |
| [Term Deposit Lifecycle](processes/term-deposit-lifecycle.md) | savings or current account | [Account Opening](processes/account-opening.md) |
| [Dormancy and Closure](processes/dormancy-and-closure.md) | customer is unhappy but not closing | [Churn Retention](processes/churn-retention.md) |
| [Daily Close (EOD)](processes/daily-close-eod.md) | regulatory report | [Regulatory Reporting](processes/regulatory-reporting.md) |
| [AML Alert Investigation](processes/aml-alert-investigation.md) | fraud reported by the customer | [Fraud and Dispute](processes/fraud-and-dispute.md) |
| [AML Alert Investigation](processes/aml-alert-investigation.md) | periodic KYC refresh | [Perpetual KYC](processes/perpetual-kyc.md) |
| [Regulatory Reporting](processes/regulatory-reporting.md) | daily close | [Daily Close (EOD)](processes/daily-close-eod.md) |
| [Agent Action Approval](processes/agent-action-approval.md) | model change | [Model Lifecycle](processes/model-lifecycle.md) |
| [Model Lifecycle](processes/model-lifecycle.md) | agent action approval | [Agent Action Approval](processes/agent-action-approval.md) |
| [Data Subject Request](processes/data-subject-request.md) | contact detail change | [Contact Detail Change](processes/contact-detail-change.md) |
| [Insurance Sale](processes/insurance-sale.md) | claim on an existing policy | [Claim Assistance](processes/claim-assistance.md) |
| [Insurance Sale](processes/insurance-sale.md) | generic offer | [Next Best Offer](processes/next-best-offer.md) |
| [Claim Assistance](processes/claim-assistance.md) | buy insurance | [Insurance Sale](processes/insurance-sale.md) |
| [Data Product Publication](processes/data-product-publication.md) | regulatory report | [Regulatory Reporting](processes/regulatory-reporting.md) |

## 4. By domain

- **customer-lifecycle:** [Account Opening](processes/account-opening.md), [Perpetual KYC](processes/perpetual-kyc.md)
- **sales-marketing:** [Next Best Offer](processes/next-best-offer.md), [Churn Retention](processes/churn-retention.md)
- **customer-service:** [Service Case (Control Tower)](processes/service-case.md), [Contact Detail Change](processes/contact-detail-change.md)
- **lending:** [Loan Origination](processes/loan-origination.md), [Collections](processes/collections.md)
- **payments-cards:** [Payment Authorisation](processes/payment-authorisation.md), [Fraud and Dispute](processes/fraud-and-dispute.md), [Card Lifecycle](processes/card-lifecycle.md), [Beneficiary Addition](processes/beneficiary-addition.md)
- **deposits-operations:** [Term Deposit Lifecycle](processes/term-deposit-lifecycle.md), [Dormancy and Closure](processes/dormancy-and-closure.md), [Daily Close (EOD)](processes/daily-close-eod.md)
- **compliance-risk:** [AML Alert Investigation](processes/aml-alert-investigation.md), [Regulatory Reporting](processes/regulatory-reporting.md)
- **governance-ai:** [Agent Action Approval](processes/agent-action-approval.md), [Model Lifecycle](processes/model-lifecycle.md), [Data Subject Request](processes/data-subject-request.md)
- **insurance:** [Insurance Sale](processes/insurance-sale.md), [Claim Assistance](processes/claim-assistance.md)
- **data-estate:** [Data Product Publication](processes/data-product-publication.md)

## 5. If nothing matches
Do not improvise (guardrail G1 in [Agent Guardrails](policies/agent-guardrails.md)). Say in one sentence what you could not match, open a case with the service agent route, and hand over to a human.
