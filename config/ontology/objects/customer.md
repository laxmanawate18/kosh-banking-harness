---
id: objfile.customer
type: object-group
name: Customer objects
version: 0.1.0
status: draft
---
# Customer objects

Who the customer is, what we know about them, and what they have allowed us to do.

Each object lists its key attributes, lifecycle states, links to other objects (edges) and the database tables that currently back it. Personal-data sensitivity follows [Consent and Privacy](../policies/consent-and-privacy.md).

<a id="obj.customer"></a>
## Customer
`obj.customer`

A person or business with a relationship with the bank, from prospect to closed.

- **Key attributes:** `customer_id`, `display_name`, `customer_type`, `tier`, `kyc_status`, `risk_rating`, `home_branch`, `onboarded_at`, `preferred_language`
- **Lifecycle:** prospect, onboarding, active, dormant, closed
- **Personal data:** high
- **Backing tables:** `bank_customers`, `core_customer_contacts`, `bank_preferences`, `app_users`
- **Links:**
  - `HOLDS` [Account](accounts-payments.md#obj.account) (accounts owned or jointly held)
  - `MEMBER_OF` [Segment](customer.md#obj.segment) (segments assigned by rule or model)
  - `PART_OF` [Household](customer.md#obj.household) (family or business grouping)
  - `MANAGED_BY` [Relationship Manager](engagement.md#obj.relationship_manager) (assigned RM)
  - `GRANTED` [Consent](customer.md#obj.consent) (consents by purpose)
  - `HAS_KYC` [KYC Record](customer.md#obj.kyc_record) (current KYC level and review date)
  - `HAS_RISK` [Risk Factor](customer.md#obj.risk_factor) (factors behind risk rating)
  - `HAS_INTERACTION` [Interaction](engagement.md#obj.interaction) (history across channels)
- **Used in processes:** [Account Opening](../processes/account-opening.md), [Perpetual KYC](../processes/perpetual-kyc.md), [Next Best Offer](../processes/next-best-offer.md), [Churn Retention](../processes/churn-retention.md), [Service Case (Control Tower)](../processes/service-case.md), [Contact Detail Change](../processes/contact-detail-change.md), [Loan Origination](../processes/loan-origination.md), [Collections](../processes/collections.md), [Fraud and Dispute](../processes/fraud-and-dispute.md), [Card Lifecycle](../processes/card-lifecycle.md), [Beneficiary Addition](../processes/beneficiary-addition.md), [Term Deposit Lifecycle](../processes/term-deposit-lifecycle.md), [Dormancy and Closure](../processes/dormancy-and-closure.md), [AML Alert Investigation](../processes/aml-alert-investigation.md), [Data Subject Request](../processes/data-subject-request.md), [Insurance Sale](../processes/insurance-sale.md), [Claim Assistance](../processes/claim-assistance.md)

<a id="obj.household"></a>
## Household
`obj.household`

A group of related customers (family or business partners) used for relationship and AML network views.

- **Key attributes:** `household_id`, `relationship_type`, `verified`
- **Lifecycle:** unverified, verified
- **Personal data:** medium
- **Backing tables:** `crm_relationships`
- **Links:**
  - `GROUPS` [Customer](customer.md#obj.customer) (member customers)
- **Used in processes:** [AML Alert Investigation](../processes/aml-alert-investigation.md)

<a id="obj.segment"></a>
## Segment
`obj.segment`

A rule- or model-defined group of customers. The 'segment of one' is the limit case.

- **Key attributes:** `code`, `name`, `segment_type`, `rule_definition`
- **Lifecycle:** draft, active, retired
- **Personal data:** none
- **Backing tables:** `crm_segments`, `crm_customer_segments`
- **Links:**
  - `CONTAINS` [Customer](customer.md#obj.customer) (members)
  - `TARGETED_BY` [Campaign](engagement.md#obj.campaign) (campaigns aimed at it)
- **Used in processes:** [Next Best Offer](../processes/next-best-offer.md)

<a id="obj.consent"></a>
## Consent
`obj.consent`

A customer's permission for a stated purpose and scope. Active means not revoked. Gates many activities.

- **Key attributes:** `consent_id`, `purpose`, `scope`, `terms_version`, `capture_method`, `granted_at`, `revoked_at`
- **Lifecycle:** granted, revoked, expired
- **Personal data:** medium
- **Backing tables:** `consents`, `bank_preferences`
- **Links:**
  - `GIVEN_BY` [Customer](customer.md#obj.customer)
- **Used in processes:** [Account Opening](../processes/account-opening.md), [Next Best Offer](../processes/next-best-offer.md), [Loan Origination](../processes/loan-origination.md), [Collections](../processes/collections.md), [Agent Action Approval](../processes/agent-action-approval.md), [Data Subject Request](../processes/data-subject-request.md), [Insurance Sale](../processes/insurance-sale.md)

<a id="obj.kyc_record"></a>
## KYC Record
`obj.kyc_record`

Verified identity evidence, KYC level and the next review date.

- **Key attributes:** `kyc_level`, `verification_method`, `status`, `risk_rating`, `pep_flag`, `next_review_due`
- **Lifecycle:** pending, verified, rejected, expired
- **Personal data:** high
- **Backing tables:** `core_kyc_records`, `ekyc_sessions`
- **Links:**
  - `VERIFIES` [Customer](customer.md#obj.customer)
  - `BASED_ON` [Document](customer.md#obj.document) (evidence documents)
  - `SCORED_BY` [Risk Factor](customer.md#obj.risk_factor)
- **Used in processes:** [Account Opening](../processes/account-opening.md), [Perpetual KYC](../processes/perpetual-kyc.md)

<a id="obj.risk_factor"></a>
## Risk Factor
`obj.risk_factor`

A single contributor to a risk rating: geography, occupation, product, channel, PEP, adverse media, behaviour.

- **Key attributes:** `factor_code`, `value`, `weight`, `source`
- **Lifecycle:** active, expired
- **Personal data:** medium
- **Backing tables:** `core_kyc_records`, `core_aml_alerts`
- **Links:**
  - `CONTRIBUTES_TO` [KYC Record](customer.md#obj.kyc_record)
  - `RAISES` [Alert](service-and-risk.md#obj.alert) (may trigger alerts)
- **Used in processes:** [Perpetual KYC](../processes/perpetual-kyc.md)

<a id="obj.document"></a>
## Document
`obj.document`

An uploaded or generated document with integrity hash, malware status and extracted fields.

- **Key attributes:** `document_type`, `content_sha256`, `storage_key`, `malware_status`, `extracted_fields`, `tamper_flags`
- **Lifecycle:** uploaded, scanned, verified, rejected
- **Personal data:** high
- **Backing tables:** `documents`, `los_application_documents`, `ins_claim_documents`, `ret_statements`
- **Links:**
  - `EVIDENCES` [KYC Record](customer.md#obj.kyc_record)
  - `SUPPORTS` [Loan Application](lending.md#obj.loan_application)
  - `SUPPORTS` [Claim](insurance.md#obj.claim)
- **Used in processes:** [Account Opening](../processes/account-opening.md), [Perpetual KYC](../processes/perpetual-kyc.md), [Loan Origination](../processes/loan-origination.md), [Claim Assistance](../processes/claim-assistance.md)
