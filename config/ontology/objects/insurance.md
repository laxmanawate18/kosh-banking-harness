---
id: objfile.insurance
type: object-group
name: Insurance objects
version: 0.1.0
status: draft
---
# Insurance objects

Bancassurance: quotes, policies, premiums and claims.

Each object lists its key attributes, lifecycle states, links to other objects (edges) and the database tables that currently back it. Personal-data sensitivity follows [Consent and Privacy](../policies/consent-and-privacy.md).

<a id="obj.insurance_quote"></a>
## Insurance Quote
`obj.insurance_quote`

A premium quote for a product, with the rating inputs used.

- **Key attributes:** `sum_assured_minor`, `term_months`, `premium_minor`, `valid_until`, `status`
- **Lifecycle:** generated, shared, accepted, expired
- **Personal data:** medium
- **Backing tables:** `ins_quotes`, `ins_products`
- **Links:**
  - `FOR` [Customer](customer.md#obj.customer)
  - `BECOMES` [Insurance Policy](insurance.md#obj.insurance_policy)
- **Used in processes:** [Insurance Sale](../processes/insurance-sale.md)

<a id="obj.insurance_policy"></a>
## Insurance Policy
`obj.insurance_policy`

A policy issued by a partner insurer: cover, insured persons, nominees and status.

- **Key attributes:** `policy_no`, `status`, `sum_assured_minor`, `premium_minor`, `premium_frequency`, `start_date`, `next_due_date`
- **Lifecycle:** in_force, grace, lapsed, paid_up, surrendered, matured, cancelled, claimed
- **Personal data:** high
- **Backing tables:** `ins_policies`, `ins_proposals`, `ins_coverages`, `ins_insured_persons`, `ins_policy_nominees`, `ins_endorsements`, `ins_policy_events`
- **Links:**
  - `HELD_BY` [Customer](customer.md#obj.customer)
  - `ISSUED_BY` [Insurer](insurance.md#obj.insurer)
  - `PAID_BY` [Premium](insurance.md#obj.premium)
  - `CLAIMED_VIA` [Claim](insurance.md#obj.claim)
- **Used in processes:** [Insurance Sale](../processes/insurance-sale.md), [Claim Assistance](../processes/claim-assistance.md)

<a id="obj.premium"></a>
## Premium
`obj.premium`

A due and paid premium instalment.

- **Key attributes:** `installment_no`, `due_date`, `amount_minor`, `status`
- **Lifecycle:** upcoming, due, paid, overdue, waived
- **Personal data:** medium
- **Backing tables:** `ins_premium_schedule`, `ins_premium_payments`
- **Links:**
  - `PAYS_FOR` [Insurance Policy](insurance.md#obj.insurance_policy)
- **Used in processes:** [Insurance Sale](../processes/insurance-sale.md)

<a id="obj.claim"></a>
## Claim
`obj.claim`

A claim against a policy. The insurer, not the bank, adjudicates it.

- **Key attributes:** `claim_no`, `claim_type`, `claimed_amount_minor`, `approved_amount_minor`, `status`
- **Lifecycle:** intimated, documents_pending, under_review, approved, rejected, settled, appealed
- **Personal data:** high
- **Backing tables:** `ins_claims`, `ins_claim_documents`
- **Links:**
  - `AGAINST` [Insurance Policy](insurance.md#obj.insurance_policy)
  - `SUPPORTED_BY` [Document](customer.md#obj.document)
- **Used in processes:** [Claim Assistance](../processes/claim-assistance.md)

<a id="obj.insurer"></a>
## Insurer
`obj.insurer`

A partner insurer and its product catalogue.

- **Key attributes:** `insurer_code`, `insurer_type`, `partnership_type`
- **Lifecycle:** active, suspended
- **Personal data:** none
- **Backing tables:** `ins_insurers`, `ins_products`, `ins_commissions`
- **Links:**
  - `UNDERWRITES` [Insurance Policy](insurance.md#obj.insurance_policy)
- **Used in processes:** [Insurance Sale](../processes/insurance-sale.md)
