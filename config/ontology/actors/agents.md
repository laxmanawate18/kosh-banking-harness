---
id: actorfile.agents
type: actor-group
name: AI Agents
version: 0.1.0
status: draft
---
# AI Agents

Each agent has a mission, the processes it runs, an autonomy ceiling and an escalation path. The ceiling is the most an agent may do alone for consequential actions (money, credit, customer status, regulatory records). See [Approval Matrix](../policies/approval-matrix.md).

<a id="actor.onboarding_agent"></a>
## Onboarding Agent
`actor.onboarding_agent`

Guides a prospect from application to an active account and card.

- **Autonomy ceiling:** A3 (Act within limits)
- **Runs processes:** [Account Opening](../processes/account-opening.md)
- **May perform activities:** [Verify Identity](../activities/verify-identity.md), [Screen Sanctions and PEP](../activities/screen-sanctions-pep.md), [Risk-Rate Customer](../activities/risk-rate-customer.md), [Check Consent](../activities/check-consent.md), [Authenticate (Step-Up)](../activities/authenticate-step-up.md), [Collect Documents](../activities/collect-documents.md), [Pull Credit Bureau](../activities/pull-credit-bureau.md), [Notify Customer](../activities/notify-customer.md), [Route to Approver](../activities/route-to-approver.md)
- **Escalates to:** [Compliance Officer](humans-and-external.md#actor.compliance_officer), [Service Officer](humans-and-external.md#actor.service_officer)

<a id="actor.kyc_agent"></a>
## KYC Agent
`actor.kyc_agent`

Keeps customer identity, risk rating and documents current (perpetual KYC).

- **Autonomy ceiling:** A3 (Act within limits)
- **Runs processes:** [Perpetual KYC](../processes/perpetual-kyc.md)
- **May perform activities:** [Verify Identity](../activities/verify-identity.md), [Screen Sanctions and PEP](../activities/screen-sanctions-pep.md), [Risk-Rate Customer](../activities/risk-rate-customer.md), [Collect Documents](../activities/collect-documents.md), [Route to Approver](../activities/route-to-approver.md), [Build Customer Context](../activities/build-customer-context.md)
- **Escalates to:** [Compliance Officer](humans-and-external.md#actor.compliance_officer)

<a id="actor.marketing_agent"></a>
## Marketing Agent
`actor.marketing_agent`

Chooses the next best offer, channel and time for a customer, within consent.

- **Autonomy ceiling:** A3 (Act within limits)
- **Runs processes:** [Next Best Offer](../processes/next-best-offer.md)
- **May perform activities:** [Check Consent](../activities/check-consent.md), [Notify Customer](../activities/notify-customer.md), [Build Customer Context](../activities/build-customer-context.md), [Check Eligibility and Suitability](../activities/check-eligibility-suitability.md), [Write Back Outcome](../activities/write-back-outcome.md)
- **Escalates to:** [Relationship Manager](humans-and-external.md#actor.relationship_manager)

<a id="actor.retention_agent"></a>
## Retention Agent
`actor.retention_agent`

Detects churn risk, diagnoses the cause and coordinates the intervention.

- **Autonomy ceiling:** A2 (Act with approval)
- **Runs processes:** [Churn Retention](../processes/churn-retention.md)
- **May perform activities:** [Check Consent](../activities/check-consent.md), [Notify Customer](../activities/notify-customer.md), [Route to Approver](../activities/route-to-approver.md), [Build Customer Context](../activities/build-customer-context.md), [Check Eligibility and Suitability](../activities/check-eligibility-suitability.md), [Write Back Outcome](../activities/write-back-outcome.md)
- **Escalates to:** [Relationship Manager](humans-and-external.md#actor.relationship_manager)

<a id="actor.service_agent"></a>
## Service Agent
`actor.service_agent`

Handles customer requests and cases end to end, handing off when out of authority.

- **Autonomy ceiling:** A3 (Act within limits)
- **Runs processes:** [Service Case (Control Tower)](../processes/service-case.md), [Contact Detail Change](../processes/contact-detail-change.md), [Dormancy and Closure](../processes/dormancy-and-closure.md)
- **May perform activities:** [Verify Identity](../activities/verify-identity.md), [Check Consent](../activities/check-consent.md), [Authenticate (Step-Up)](../activities/authenticate-step-up.md), [Notify Customer](../activities/notify-customer.md), [Open Case](../activities/open-case.md), [Build Customer Context](../activities/build-customer-context.md), [Write Back Outcome](../activities/write-back-outcome.md)
- **Escalates to:** [Service Officer](humans-and-external.md#actor.service_officer)

<a id="actor.payments_agent"></a>
## Payments and Cards Agent
`actor.payments_agent`

Runs payment authorisation, payee changes and the card lifecycle.

- **Autonomy ceiling:** A3 (Act within limits)
- **Runs processes:** [Payment Authorisation](../processes/payment-authorisation.md), [Card Lifecycle](../processes/card-lifecycle.md), [Beneficiary Addition](../processes/beneficiary-addition.md)
- **May perform activities:** [Authenticate (Step-Up)](../activities/authenticate-step-up.md), [Check Limits and Balance](../activities/check-limits-and-balance.md), [Score Transaction Risk](../activities/score-transaction-risk.md), [Place Balance Hold](../activities/place-balance-hold.md), [Notify Customer](../activities/notify-customer.md), [Validate Beneficiary](../activities/validate-beneficiary.md)
- **Escalates to:** [Fraud Analyst](humans-and-external.md#actor.fraud_analyst), [Service Officer](humans-and-external.md#actor.service_officer)

<a id="actor.fraud_agent"></a>
## Fraud Triage Agent
`actor.fraud_agent`

Takes protective action on suspected fraud and prepares disputes for analysts.

- **Autonomy ceiling:** A3 (Act within limits)
- **Runs processes:** [Fraud and Dispute](../processes/fraud-and-dispute.md)
- **May perform activities:** [Score Transaction Risk](../activities/score-transaction-risk.md), [Notify Customer](../activities/notify-customer.md), [Open Case](../activities/open-case.md)
- **Escalates to:** [Fraud Analyst](humans-and-external.md#actor.fraud_analyst)

<a id="actor.aml_agent"></a>
## AML Triage Agent
`actor.aml_agent`

Triages and enriches AML alerts and drafts investigation narratives. Never decides.

- **Autonomy ceiling:** A1 (Recommend)
- **Runs processes:** [AML Alert Investigation](../processes/aml-alert-investigation.md)
- **May perform activities:** [Screen Sanctions and PEP](../activities/screen-sanctions-pep.md), [Build Customer Context](../activities/build-customer-context.md)
- **Escalates to:** [AML Investigator](humans-and-external.md#actor.aml_investigator), [Money Laundering Reporting Officer](humans-and-external.md#actor.mlro)

<a id="actor.lending_agent"></a>
## Lending Agent
`actor.lending_agent`

Takes a loan application from pre-qualification to disbursement.

- **Autonomy ceiling:** A2 (Act with approval)
- **Runs processes:** [Loan Origination](../processes/loan-origination.md)
- **May perform activities:** [Verify Identity](../activities/verify-identity.md), [Check Consent](../activities/check-consent.md), [Collect Documents](../activities/collect-documents.md), [Pull Credit Bureau](../activities/pull-credit-bureau.md), [Route to Approver](../activities/route-to-approver.md), [Build Customer Context](../activities/build-customer-context.md), [Check Eligibility and Suitability](../activities/check-eligibility-suitability.md)
- **Escalates to:** [Credit Officer](humans-and-external.md#actor.credit_officer)

<a id="actor.collections_agent"></a>
## Collections Agent
`actor.collections_agent`

Manages early-stage delinquency contact within conduct rules.

- **Autonomy ceiling:** A2 (Act with approval)
- **Runs processes:** [Collections](../processes/collections.md)
- **May perform activities:** [Check Consent](../activities/check-consent.md), [Notify Customer](../activities/notify-customer.md), [Route to Approver](../activities/route-to-approver.md), [Open Case](../activities/open-case.md), [Write Back Outcome](../activities/write-back-outcome.md)
- **Escalates to:** [Collections Officer](humans-and-external.md#actor.collections_officer)

<a id="actor.operations_agent"></a>
## Operations Agent
`actor.operations_agent`

Monitors and runs deposit servicing and end-of-day jobs.

- **Autonomy ceiling:** A3 (Act within limits)
- **Runs processes:** [Term Deposit Lifecycle](../processes/term-deposit-lifecycle.md), [Daily Close (EOD)](../processes/daily-close-eod.md)
- **May perform activities:** [Check Limits and Balance](../activities/check-limits-and-balance.md), [Place Balance Hold](../activities/place-balance-hold.md), [Reconcile](../activities/reconcile.md)
- **Escalates to:** [Operations Officer](humans-and-external.md#actor.operations_officer), [Finance Operations](humans-and-external.md#actor.finance_ops)

<a id="actor.insurance_agent"></a>
## Insurance Agent
`actor.insurance_agent`

Supports insurance sales and claim assistance as a distributor.

- **Autonomy ceiling:** A2 (Act with approval)
- **Runs processes:** [Insurance Sale](../processes/insurance-sale.md), [Claim Assistance](../processes/claim-assistance.md)
- **May perform activities:** [Check Consent](../activities/check-consent.md), [Authenticate (Step-Up)](../activities/authenticate-step-up.md), [Collect Documents](../activities/collect-documents.md), [Notify Customer](../activities/notify-customer.md), [Route to Approver](../activities/route-to-approver.md), [Open Case](../activities/open-case.md), [Build Customer Context](../activities/build-customer-context.md), [Check Eligibility and Suitability](../activities/check-eligibility-suitability.md)
- **Escalates to:** [Licensed Insurance Advisor](humans-and-external.md#actor.licensed_advisor), [Service Officer](humans-and-external.md#actor.service_officer)

<a id="actor.reporting_agent"></a>
## Reporting Agent
`actor.reporting_agent`

Prepares regulatory reports and validates them. Never submits alone.

- **Autonomy ceiling:** A2 (Act with approval)
- **Runs processes:** [Regulatory Reporting](../processes/regulatory-reporting.md)
- **May perform activities:** [Route to Approver](../activities/route-to-approver.md), [Reconcile](../activities/reconcile.md), [Check Data Quality](../activities/check-data-quality.md)
- **Escalates to:** [Finance Operations](humans-and-external.md#actor.finance_ops), [Compliance Officer](humans-and-external.md#actor.compliance_officer)

<a id="actor.data_agent"></a>
## Data Agent
`actor.data_agent`

Publishes data products and supports data-subject requests.

- **Autonomy ceiling:** A2 (Act with approval)
- **Runs processes:** [Data Subject Request](../processes/data-subject-request.md), [Data Product Publication](../processes/data-product-publication.md)
- **May perform activities:** [Verify Identity](../activities/verify-identity.md), [Check Consent](../activities/check-consent.md), [Route to Approver](../activities/route-to-approver.md), [Check Data Quality](../activities/check-data-quality.md)
- **Escalates to:** [Data Steward](humans-and-external.md#actor.data_steward), [Privacy Officer](humans-and-external.md#actor.privacy_officer)

<a id="actor.governance_agent"></a>
## Governance Agent
`actor.governance_agent`

Checks proposed agent actions against policy and monitors models.

- **Autonomy ceiling:** A1 (Recommend)
- **Runs processes:** [Agent Action Approval](../processes/agent-action-approval.md), [Model Lifecycle](../processes/model-lifecycle.md)
- **May perform activities:** [Route to Approver](../activities/route-to-approver.md)
- **Escalates to:** [Compliance Officer](humans-and-external.md#actor.compliance_officer), [Model Risk Officer](humans-and-external.md#actor.model_risk_officer)
