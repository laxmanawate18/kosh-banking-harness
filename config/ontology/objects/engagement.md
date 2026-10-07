---
id: objfile.engagement
type: object-group
name: Engagement objects
version: 0.1.0
status: draft
---
# Engagement objects

Products, offers, campaigns, channels and interactions (the whitepaper's commercial layer).

Each object lists its key attributes, lifecycle states, links to other objects (edges) and the database tables that currently back it. Personal-data sensitivity follows [Consent and Privacy](../policies/consent-and-privacy.md).

<a id="obj.product"></a>
## Product
`obj.product`

A bank product (deposit, loan, card, insurance) with eligibility, rates and fees.

- **Key attributes:** `product_code`, `category`, `sub_type`, `eligibility`, `effective_from`, `status`
- **Lifecycle:** draft, active, retired
- **Personal data:** none
- **Backing tables:** `core_products`, `core_interest_rates`, `core_fee_schedules`, `los_loan_products`, `ins_products`
- **Links:**
  - `PROMOTED_BY` [Offer](engagement.md#obj.offer)
  - `HELD_AS` [Account](accounts-payments.md#obj.account)
- **Used in processes:** [Account Opening](../processes/account-opening.md), [Next Best Offer](../processes/next-best-offer.md), [Loan Origination](../processes/loan-origination.md), [Term Deposit Lifecycle](../processes/term-deposit-lifecycle.md), [Insurance Sale](../processes/insurance-sale.md)

<a id="obj.offer"></a>
## Offer
`obj.offer`

A time-bound proposition for a product with eligibility rules and approval.

- **Key attributes:** `offer_code`, `eligibility_rule`, `discount_type`, `valid_from`, `valid_to`, `status`
- **Lifecycle:** draft, active, paused, expired
- **Personal data:** none
- **Backing tables:** `crm_offers`, `offer_events`
- **Links:**
  - `FOR` [Product](engagement.md#obj.product)
  - `PART_OF` [Campaign](engagement.md#obj.campaign)
  - `MADE_TO` [Customer](customer.md#obj.customer) (via offer events)
- **Used in processes:** [Next Best Offer](../processes/next-best-offer.md)

<a id="obj.campaign"></a>
## Campaign
`obj.campaign`

A coordinated outreach to a segment with an offer, channel and template.

- **Key attributes:** `name`, `objective`, `channel`, `start_at`, `end_at`, `status`
- **Lifecycle:** draft, scheduled, running, completed, cancelled
- **Personal data:** none
- **Backing tables:** `crm_campaigns`, `crm_campaign_members`, `crm_message_templates`
- **Links:**
  - `TARGETS` [Segment](customer.md#obj.segment)
  - `PROMOTES` [Offer](engagement.md#obj.offer)
- **Used in processes:** none

<a id="obj.channel"></a>
## Channel
`obj.channel`

A way to reach or hear the customer: app, web, WhatsApp, voice, branch, email, SMS.

- **Key attributes:** `channel_code`, `preferences`, `template_rules`
- **Lifecycle:** enabled, disabled
- **Personal data:** none
- **Backing tables:** `notification_outbox`, `crm_message_templates`, `bank_preferences`
- **Links:**
  - `CARRIES` [Interaction](engagement.md#obj.interaction)
- **Used in processes:** none

<a id="obj.interaction"></a>
## Interaction
`obj.interaction`

Any exchange with a customer on any channel, including assistant conversations.

- **Key attributes:** `channel`, `direction`, `interaction_type`, `summary`, `sentiment`, `occurred_at`
- **Lifecycle:** logged
- **Personal data:** medium
- **Backing tables:** `crm_interactions`, `conversation_sessions`, `mitra_turns`, `chat_feedback`
- **Links:**
  - `WITH` [Customer](customer.md#obj.customer)
  - `ON` [Channel](engagement.md#obj.channel)
  - `MAY_CREATE` [Case](service-and-risk.md#obj.case)
- **Used in processes:** [Next Best Offer](../processes/next-best-offer.md), [Churn Retention](../processes/churn-retention.md), [Service Case (Control Tower)](../processes/service-case.md), [Collections](../processes/collections.md)

<a id="obj.lead_opportunity"></a>
## Lead and Opportunity
`obj.lead_opportunity`

A sales lead and the pipeline opportunity it becomes.

- **Key attributes:** `category`, `stage`, `expected_value_minor`, `probability_pct`, `owner`, `lost_reason`
- **Lifecycle:** lead, qualified, proposal, negotiation, won, lost
- **Personal data:** medium
- **Backing tables:** `cross_sell_leads`, `crm_opportunities`
- **Links:**
  - `FOR` [Customer](customer.md#obj.customer)
  - `ABOUT` [Product](engagement.md#obj.product)
  - `CONVERTS_TO` [Loan Application](lending.md#obj.loan_application) (or policy, deposit)
- **Used in processes:** [Next Best Offer](../processes/next-best-offer.md), [Churn Retention](../processes/churn-retention.md)

<a id="obj.relationship_manager"></a>
## Relationship Manager
`obj.relationship_manager`

The human who owns a customer relationship. See the actor definition for permissions.

- **Key attributes:** `rm_user_id`, `assignment_type`, `assigned_from`
- **Lifecycle:** assigned, reassigned
- **Personal data:** none
- **Backing tables:** `crm_rm_assignments`, `crm_tasks`, `app_users`
- **Links:**
  - `MANAGES` [Customer](customer.md#obj.customer)
- **Used in processes:** none
