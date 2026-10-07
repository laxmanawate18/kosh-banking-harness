# Banking ontology in Kosh

The banking business ontology in `config/ontology/` describes what the bank does: processes, shared activities, objects, actors, events and policies. Kosh uses it to answer one question on every Mitra turn: **which business process is this turn part of?**

## What it does and does not do

| | |
|---|---|
| **Selects** | One process per turn, from the processes the agent's channel may use (`kosh_channels`). |
| **Tells the model** | Only that process, trimmed: purpose, steps, exceptions, its activities' rules, the agent guardrails and Mitra's part in Kosh (`kosh_note`). Never other processes, table names, edges, evidence or detection logic. |
| **Narrows** | When a process is selected, a write or money tool outside its `kosh_tools` is refused. Reads, complaints and callbacks are always allowed. |
| **Never grants** | Permissions stay in the harness (`config/harness/tools.json`), Sentinel, Kavach and four-eyes. A wrong selection can only make Mitra do less. |
| **Records** | The process id on every turn (`mitra_turns.process_id`), on tool decisions (`details.process` of `AGENT_TOOL_ALLOWED` / `AGENT_TOOL_DENIED`) and on copilot turns. |

The full ontology is read on the server (routing, tests, this report). The model reads only the selected process.

## How a turn is routed (`backend/ontology.py`)

In order, first match wins:
1. A care intent (`backend/care.py`): fraud, complaint, human, distress.
2. What the person opened explicitly: the form in the app, or for the officer copilot the request on screen.
3. Sentinel's intent: transfer and bill payment to Payment Authorisation, freeze and alerts to Card Lifecycle.
4. The process's own trigger phrases (*Use this process when*), whole words only.
5. The keyword skill guess (`workflow_catalogue.detect_workflow_skill`). A balance or spending question is an enquiry and selects no process.
6. The process already in progress in this chat.
7. Customer and officer chats only: a model that may answer nothing but one of the channel's process ids or `general`. It reads the message after identifiers are swapped for tags. Any error or a 2.5-second timeout selects nothing.

A customer or visitor can never be routed to an officer-only process (AML, regulatory reporting, model lifecycle, data publication, churn, day close, agent-action approval), even by naming it. Processes Kosh does not run (`kosh_status: not_implemented`) tell Mitra to say so in one sentence and offer a callback, while still answering from published facts.

## Switching it on

`ONTOLOGY_MODE` (environment):

| Value | Effect |
|---|---|
| `off` (default) | Nothing changes. The approved prompt version stays valid. |
| `shadow` | Routes and records the process on every turn. Replies and tools are unchanged; the prompt version is unchanged. |
| `on` | Records, adds the process guide to the turn and narrows tools. The ontology's hash becomes part of the prompt version, so it needs a passing evaluation and approval in the officer console. |

**Production uses only approved files.** With `on` in production, a process guides Mitra only when its file has `status: approved` (see `config/ontology/conventions.md`). Every file is `draft` today, so in production `on` behaves like `shadow` until the owners review and compliance approves each process.

Suggested rollout: `shadow` in production, review `process_id` on `mitra_turns`, approve the processes, then `on` with a fresh evaluation run.

## Changing the ontology

1. Edit the Markdown under `config/ontology/` (see `conventions.md`).
2. Run `venv/bin/python -m pytest tests/test_ontology.py`. It runs the ontology's own validator and checks that every binding points at real code: tools in `tools.json`, skills and workflows, care intents, service ids and tables. It also checks that every Kosh write tool and workflow has exactly one process, that money tools need the customer's approval, that recommend-only agents never act alone, and that the model's view leaks nothing internal.
3. With `on`, the edit changes the prompt version: run the evaluation and approve it.

## Conformance: what the ontology requires and what Kosh enforces

Checked against the code on 2026-10-07.

### Authentication assurance (`policies/authentication-assurance.md`)

| Action | Ontology | Kosh | Result |
|---|---|---|---|
| View balances and transactions | L1 | Signed-in chat session | Meets |
| Download statements | L1 | Statement form, level L2 | Stricter |
| Add or edit a payee | L2 | Portal payee screen needs L3 (`portal.py`) | Stricter |
| Make a payment | L2, L3 above high value | Every Kavach approval needs L3 (`backend/auth_routes.py`) | Stricter |
| Change address | L3 | Address form submit needs L3 (`banking_workflows.py`) | Meets |
| Change phone or email | L3 | Not available | n/a |
| Standing instruction | L2 | Form level L3 | Stricter |
| Close account, exit deposit early, accept loan, data-subject request | L3 | Not available | n/a |

### Approval matrix (`policies/approval-matrix.md`)

| # | Action class | Kosh | Result |
|---|---|---|---|
| 1 | Read customer context | Read tools, consent-gated per tool, model sees only declared fields | Meets |
| 3 | Promotional message | `get_next_best_offer`: marketing consent, KYC and frequency rules | Meets |
| 5–7 | Payments | No agent payment limit: every payment needs the customer's Kavach approval; Sentinel denies at score 80 with no override in chat | Stricter |
| 8 | Protective card freeze | Freeze runs at once and is audited (`CARD_FROZEN`) | **Gap**: nothing queues it for a fraud analyst to review afterwards |
| 11 | High-risk onboarding | Account opening needs an officer's approval | **Gap**: any officer, not a compliance officer (Kosh has one officer role) |
| 17 | Model approval | Prompt versions approved in the officer console after a passing evaluation | **Gap**: any officer, not a model risk officer |
| 19 | Deletion of customer data | `DELETE /api/officer/customers/{id}` wipes at once | **Gap**: one officer alone, no second approver or retention-hold check, and the audit record stores the raw phone number and customer id (audit policy rule 3, guardrail G9) |
| 10, 12–16, 20, 21 | Sanctions, credit, regulatory, ledger, insurance advice | Not performed by Kosh | n/a |

Four-eyes for officer decisions (an officer cannot decide on their own account; an escalated request is approved by someone else) meets guardrail G5.

### Parameters
`PARAM_AGENT_PAYMENT_LIMIT` (₹0: Mitra never completes a payment alone) and `PARAM_STEP_UP_MAX_FAILURES` (3 Kavach attempts, 300-second expiry) are bound to `config/harness/policy.json`. The other eight parameters are unset; the ontology treats an unset parameter as most restrictive.

## Shadow check on the evaluation set

The deterministic router was run over all 294 evaluation cases offline. Changes made from it:
- Loan triggers were *personal loan* and *home loan*, which caught product-rate questions; they are now *apply for a personal loan* and *apply for a home loan*.
- A not-available process no longer stops Mitra answering from published facts ("Do I need insurance to get a home loan?" matches Insurance Sale).
- The classifier is not used for visitors: most of their messages are product questions, so it would add a model call to nearly every turn for little gain.

## Not built yet
- The roughly 100 tables proposed in `sentinel_updated_schema - Relationships.csv` (`core_*`, `crm_*`, `gl_*`, `los_*`, `ins_*`, `ret_*`, `dl_*`). Add them when a process that needs them comes into scope. Alembic must run on deploy first; today the app creates tables itself.
- Separate officer roles (compliance, fraud analyst, credit, privacy, model risk) that the approval matrix names.
- A process breakdown on the Mitra quality dashboard; the data is on `mitra_turns.process_id`.
