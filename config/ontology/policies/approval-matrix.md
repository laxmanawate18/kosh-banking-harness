---
id: pol.approval_matrix
type: policy
name: Approval Matrix
version: 0.1.0
status: draft
owner: compliance_officer
---
# Approval Matrix

Defines which actions an agent may take alone, which need a named human approver, and which are human-only.
Read this file whenever a step has an approval gate, or when you are unsure whether you may act.

## Rules for reading this matrix
1. The matrix sets a **ceiling** for each action class. An agent's own ceiling (see [agents](../actors/agents.md)) applies to its *consequential* actions: those that move money, grant or change credit, change customer status, or touch regulatory records. For those, the lower of the two applies. Read-only checks, notifications and evidence steps run at the level the activity states.
2. Values shown as `PARAM_*` are parameters set by the bank (see the table at the end). **If a parameter has no value, treat the action as one level more restrictive and escalate.** Never invent a value.
3. An approval covers exactly the action and scope in the request. It does not carry over to a different action, amount or customer.
4. The approver is never the requester, and never the same agent identity.

## Autonomy levels
| Level | Name | Meaning |
|---|---|---|
| A0 | Observe | Read-only. Answers and explains. Changes nothing. |
| A1 | Recommend | Drafts, scores or recommends. A human performs the action. |
| A2 | Act with approval | Agent executes only after a named approver approves in this run. |
| A3 | Act within limits | Agent executes alone inside limits. Every action is audited. Outside limits it escalates. |

## Matrix
| # | Action class | Autonomy | Approver or owner | Conditions |
|---|---|---|---|---|
| 1 | Read customer context for a stated purpose | A3 | none | Purpose-limited, consent where required |
| 2 | Send a transactional or regulatory notice | A3 | none | Approved template only |
| 3 | Send a promotional message | A3 | none | `check_consent` returns allow, quiet hours and frequency caps respected |
| 4 | Concession beyond agent authority (fee waiver, rate, retention offer) | A2 | relationship_manager | Above `PARAM_CONCESSION_LIMIT` |
| 5 | Payment with decision `allow` | A3 | customer confirms in the same session | At or below `PARAM_AGENT_PAYMENT_LIMIT` |
| 6 | Payment with decision `step_up` | A3 after challenge | customer completes challenge | The agent never sees the OTP |
| 7 | Payment above the agent limit, or any `block` override | A2 | fraud_analyst | Above `PARAM_AGENT_PAYMENT_LIMIT` |
| 8 | Protective card block or account freeze | A3 | none, reviewed afterwards by fraud_analyst | Always reversible |
| 9 | Provisional credit on a dispute | A2 | fraud_analyst | Within dispute turnaround time |
| 10 | Clearing a potential or confirmed sanctions or PEP match | Human only | compliance_officer | Agent may never clear |
| 11 | Onboarding a high-risk customer | A2 | compliance_officer | Enhanced due diligence complete |
| 12 | Any underwriting decision | A2 | credit_officer | Auto-approval of low-risk small loans is **off** unless bank policy turns it on |
| 13 | Loan disbursement | A2 | credit_officer | Conditions precedent met |
| 14 | Restructure or legal escalation | A2 | collections_officer | Contact log attached |
| 15 | Filing a suspicious transaction report | Human only | mlro | Agent may prepare, not decide or file |
| 16 | Regulatory submission | A2 | finance_ops reviews, compliance_officer approves | Maker-checker: two different people |
| 17 | Model approval or retirement | A2 | model_risk_officer | Evaluation summary attached |
| 18 | Data access grant | A2 | data_steward | Purpose and masking policy stated |
| 19 | Deletion in response to a data-subject request | A2 | privacy_officer | After retention-hold check |
| 20 | Ledger corrections and manual adjustments | A1 | finance_ops posts | Agent proposes only |
| 21 | Insurance advice for complex products or vulnerable customers | Human only | licensed_advisor | Regulated activity |

## Parameters (set by the bank)
A value marked *Kosh* is what the Kosh code enforces today, with where it is set. Everything else is unset: treat it as most restrictive.

| Parameter | Meaning | Owner | Value |
|---|---|---|---|
| `PARAM_AGENT_PAYMENT_LIMIT` | Highest payment an agent may complete alone | Payments head | Kosh: ₹0. Mitra never completes a payment alone; every transfer and bill payment needs the customer's Kavach approval (`config/harness/policy.json` `sentinel.always_customer_approval`) |
| `PARAM_CONCESSION_LIMIT` | Largest fee or rate concession an agent may offer | Retail head | not set |
| `PARAM_NEW_PAYEE_COOLING_HOURS` | Cooling-off period for a new payee | Fraud head | not set |
| `PARAM_NEW_PAYEE_LIMIT` | Reduced limit during cooling-off | Fraud head | not set |
| `PARAM_STEP_UP_MAX_FAILURES` | Failed challenges before lock | Security | Kosh: 3 attempts per Kavach payment challenge (`sentinel.challenge_max_attempts`), which expires after 300 s (`sentinel.challenge_ttl_seconds`). Sign-in step-up limits: not set here |
| `PARAM_STEP_UP_LOCK_MINUTES` | Lock duration after failures | Security | not set |
| `PARAM_CONTACT_HOURS` | Permitted contact window for collections | Collections head | not set |
| `PARAM_MAX_CONTACT_ATTEMPTS` | Attempts before escalation | Collections head | not set |
| `PARAM_APPLICATION_EXPIRY_DAYS` | Days before an abandoned application expires | Retail head | not set |
| `PARAM_DISPUTE_TAT_DAYS` | Dispute turnaround under the applicable rules | Operations | not set |
