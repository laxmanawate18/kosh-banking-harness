---
id: eventfile
type: event-catalogue
name: Business Events
version: 0.1.0
status: draft
---
# Business Events

Events start processes. When a task or signal matches an event, start the listed process.

| Event | Meaning | Starts |
|---|---|---|
| [Application submitted](#evt.application_submitted) | A prospect submits an account-opening application. | [Account Opening](processes/account-opening.md) |
| [Account opened](#evt.account_opened) | Emitted when Account Opening finalises. Starts welcome offer. | [Next Best Offer](processes/next-best-offer.md) |
| [KYC review due](#evt.kyc_review_due) | Scheduled review date reached for a customer. | [Perpetual KYC](processes/perpetual-kyc.md) |
| [Customer profile changed](#evt.profile_changed) | Material change to address, income, occupation or ownership. | [Perpetual KYC](processes/perpetual-kyc.md) |
| [Adverse media hit](#evt.adverse_media_hit) | External screening returns new adverse information. | [Perpetual KYC](processes/perpetual-kyc.md) |
| [Customer signal](#evt.customer_signal) | Behavioural event suggesting a need, e.g. salary credit, large balance, life event. | [Next Best Offer](processes/next-best-offer.md) |
| [Churn signal](#evt.churn_signal) | Churn score above threshold, balance drain, closure intent or repeated complaints. | [Churn Retention](processes/churn-retention.md) |
| [Case received](#evt.case_received) | Customer request or complaint arrives on any channel. | [Service Case (Control Tower)](processes/service-case.md) |
| [Contact change requested](#evt.contact_change_requested) | Customer asks to change phone, email or address. | [Contact Detail Change](processes/contact-detail-change.md) |
| [Loan requested](#evt.loan_requested) | Customer or lead asks for a loan. | [Loan Origination](processes/loan-origination.md) |
| [Loan disbursed](#evt.loan_disbursed) | First disbursement completes. | [Collections](processes/collections.md) |
| [EMI missed](#evt.emi_missed) | An instalment is unpaid past its due date. | [Collections](processes/collections.md) |
| [Payment requested](#evt.payment_requested) | A payment intent is created by customer or by a delegated agent. | [Payment Authorisation](processes/payment-authorisation.md) |
| [Suspicious activity](#evt.suspicious_activity) | Fraud signal or customer reports unauthorised activity. | [Fraud and Dispute](processes/fraud-and-dispute.md) |
| [Card requested](#evt.card_requested) | New, replacement or limit-change request for a card. | [Card Lifecycle](processes/card-lifecycle.md) |
| [Beneficiary add requested](#evt.beneficiary_add_requested) | Customer asks to add or edit a payee. | [Beneficiary Addition](processes/beneficiary-addition.md) |
| [Deposit opened](#evt.deposit_opened) | Customer opens a fixed or recurring deposit. | [Term Deposit Lifecycle](processes/term-deposit-lifecycle.md) |
| [Maturity approaching](#evt.maturity_approaching) | A term deposit nears its maturity date. | [Term Deposit Lifecycle](processes/term-deposit-lifecycle.md) |
| [Inactivity threshold reached](#evt.inactivity_threshold) | Account inactive for the configured period. | [Dormancy and Closure](processes/dormancy-and-closure.md) |
| [Closure requested](#evt.closure_requested) | Customer asks to close an account. | [Dormancy and Closure](processes/dormancy-and-closure.md) |
| [Business date end](#evt.business_date_end) | Cut-off for the current business date. | [Daily Close (EOD)](processes/daily-close-eod.md) |
| [AML alert raised](#evt.aml_alert_raised) | Monitoring rule or screening produces an alert. | [AML Alert Investigation](processes/aml-alert-investigation.md) |
| [Reporting period end](#evt.reporting_period_end) | A regulatory reporting period closes. | [Regulatory Reporting](processes/regulatory-reporting.md) |
| [Agent action proposed](#evt.agent_action_proposed) | An agent proposes an action that needs governance approval. | [Agent Action Approval](processes/agent-action-approval.md) |
| [Model change proposed](#evt.model_change_proposed) | New model or material change to a model is proposed. | [Model Lifecycle](processes/model-lifecycle.md) |
| [Data subject request received](#evt.dsr_received) | Customer asks for access, correction or deletion of personal data. | [Data Subject Request](processes/data-subject-request.md) |
| [Insurance lead](#evt.insurance_lead) | Lead or need identified for an insurance product. | [Insurance Sale](processes/insurance-sale.md) |
| [Claim intimated](#evt.claim_intimated) | Customer reports an insurance claim. | [Claim Assistance](processes/claim-assistance.md) |
| [New data source](#evt.new_data_source) | A new source is requested for the data lake. | [Data Product Publication](processes/data-product-publication.md) |

<a id="evt.application_submitted"></a>
## Application submitted
`evt.application_submitted`

A prospect submits an account-opening application.
- **Starts:** [Account Opening](processes/account-opening.md)
- **Emitted by:** external or monitoring systems

<a id="evt.account_opened"></a>
## Account opened
`evt.account_opened`

Emitted when Account Opening finalises. Starts welcome offer.
- **Starts:** [Next Best Offer](processes/next-best-offer.md)
- **Emitted by:** [Account Opening](processes/account-opening.md)

<a id="evt.kyc_review_due"></a>
## KYC review due
`evt.kyc_review_due`

Scheduled review date reached for a customer.
- **Starts:** [Perpetual KYC](processes/perpetual-kyc.md)
- **Emitted by:** external or monitoring systems

<a id="evt.profile_changed"></a>
## Customer profile changed
`evt.profile_changed`

Material change to address, income, occupation or ownership.
- **Starts:** [Perpetual KYC](processes/perpetual-kyc.md)
- **Emitted by:** external or monitoring systems

<a id="evt.adverse_media_hit"></a>
## Adverse media hit
`evt.adverse_media_hit`

External screening returns new adverse information.
- **Starts:** [Perpetual KYC](processes/perpetual-kyc.md)
- **Emitted by:** external or monitoring systems

<a id="evt.customer_signal"></a>
## Customer signal
`evt.customer_signal`

Behavioural event suggesting a need, e.g. salary credit, large balance, life event.
- **Starts:** [Next Best Offer](processes/next-best-offer.md)
- **Emitted by:** external or monitoring systems

<a id="evt.churn_signal"></a>
## Churn signal
`evt.churn_signal`

Churn score above threshold, balance drain, closure intent or repeated complaints.
- **Starts:** [Churn Retention](processes/churn-retention.md)
- **Emitted by:** external or monitoring systems

<a id="evt.case_received"></a>
## Case received
`evt.case_received`

Customer request or complaint arrives on any channel.
- **Starts:** [Service Case (Control Tower)](processes/service-case.md)
- **Emitted by:** external or monitoring systems

<a id="evt.contact_change_requested"></a>
## Contact change requested
`evt.contact_change_requested`

Customer asks to change phone, email or address.
- **Starts:** [Contact Detail Change](processes/contact-detail-change.md)
- **Emitted by:** external or monitoring systems

<a id="evt.loan_requested"></a>
## Loan requested
`evt.loan_requested`

Customer or lead asks for a loan.
- **Starts:** [Loan Origination](processes/loan-origination.md)
- **Emitted by:** external or monitoring systems

<a id="evt.loan_disbursed"></a>
## Loan disbursed
`evt.loan_disbursed`

First disbursement completes.
- **Starts:** [Collections](processes/collections.md)
- **Emitted by:** [Loan Origination](processes/loan-origination.md)

<a id="evt.emi_missed"></a>
## EMI missed
`evt.emi_missed`

An instalment is unpaid past its due date.
- **Starts:** [Collections](processes/collections.md)
- **Emitted by:** external or monitoring systems

<a id="evt.payment_requested"></a>
## Payment requested
`evt.payment_requested`

A payment intent is created by customer or by a delegated agent.
- **Starts:** [Payment Authorisation](processes/payment-authorisation.md)
- **Emitted by:** external or monitoring systems

<a id="evt.suspicious_activity"></a>
## Suspicious activity
`evt.suspicious_activity`

Fraud signal or customer reports unauthorised activity.
- **Starts:** [Fraud and Dispute](processes/fraud-and-dispute.md)
- **Emitted by:** external or monitoring systems

<a id="evt.card_requested"></a>
## Card requested
`evt.card_requested`

New, replacement or limit-change request for a card.
- **Starts:** [Card Lifecycle](processes/card-lifecycle.md)
- **Emitted by:** external or monitoring systems

<a id="evt.beneficiary_add_requested"></a>
## Beneficiary add requested
`evt.beneficiary_add_requested`

Customer asks to add or edit a payee.
- **Starts:** [Beneficiary Addition](processes/beneficiary-addition.md)
- **Emitted by:** external or monitoring systems

<a id="evt.deposit_opened"></a>
## Deposit opened
`evt.deposit_opened`

Customer opens a fixed or recurring deposit.
- **Starts:** [Term Deposit Lifecycle](processes/term-deposit-lifecycle.md)
- **Emitted by:** external or monitoring systems

<a id="evt.maturity_approaching"></a>
## Maturity approaching
`evt.maturity_approaching`

A term deposit nears its maturity date.
- **Starts:** [Term Deposit Lifecycle](processes/term-deposit-lifecycle.md)
- **Emitted by:** external or monitoring systems

<a id="evt.inactivity_threshold"></a>
## Inactivity threshold reached
`evt.inactivity_threshold`

Account inactive for the configured period.
- **Starts:** [Dormancy and Closure](processes/dormancy-and-closure.md)
- **Emitted by:** external or monitoring systems

<a id="evt.closure_requested"></a>
## Closure requested
`evt.closure_requested`

Customer asks to close an account.
- **Starts:** [Dormancy and Closure](processes/dormancy-and-closure.md)
- **Emitted by:** external or monitoring systems

<a id="evt.business_date_end"></a>
## Business date end
`evt.business_date_end`

Cut-off for the current business date.
- **Starts:** [Daily Close (EOD)](processes/daily-close-eod.md)
- **Emitted by:** external or monitoring systems

<a id="evt.aml_alert_raised"></a>
## AML alert raised
`evt.aml_alert_raised`

Monitoring rule or screening produces an alert.
- **Starts:** [AML Alert Investigation](processes/aml-alert-investigation.md)
- **Emitted by:** external or monitoring systems

<a id="evt.reporting_period_end"></a>
## Reporting period end
`evt.reporting_period_end`

A regulatory reporting period closes.
- **Starts:** [Regulatory Reporting](processes/regulatory-reporting.md)
- **Emitted by:** external or monitoring systems

<a id="evt.agent_action_proposed"></a>
## Agent action proposed
`evt.agent_action_proposed`

An agent proposes an action that needs governance approval.
- **Starts:** [Agent Action Approval](processes/agent-action-approval.md)
- **Emitted by:** external or monitoring systems

<a id="evt.model_change_proposed"></a>
## Model change proposed
`evt.model_change_proposed`

New model or material change to a model is proposed.
- **Starts:** [Model Lifecycle](processes/model-lifecycle.md)
- **Emitted by:** external or monitoring systems

<a id="evt.dsr_received"></a>
## Data subject request received
`evt.dsr_received`

Customer asks for access, correction or deletion of personal data.
- **Starts:** [Data Subject Request](processes/data-subject-request.md)
- **Emitted by:** external or monitoring systems

<a id="evt.insurance_lead"></a>
## Insurance lead
`evt.insurance_lead`

Lead or need identified for an insurance product.
- **Starts:** [Insurance Sale](processes/insurance-sale.md)
- **Emitted by:** external or monitoring systems

<a id="evt.claim_intimated"></a>
## Claim intimated
`evt.claim_intimated`

Customer reports an insurance claim.
- **Starts:** [Claim Assistance](processes/claim-assistance.md)
- **Emitted by:** external or monitoring systems

<a id="evt.new_data_source"></a>
## New data source
`evt.new_data_source`

A new source is requested for the data lake.
- **Starts:** [Data Product Publication](processes/data-product-publication.md)
- **Emitted by:** external or monitoring systems
