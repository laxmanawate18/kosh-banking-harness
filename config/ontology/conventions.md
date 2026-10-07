---
id: conventions
type: conventions
name: Conventions
version: 0.1.0
status: draft
---
# Conventions

How the ontology is written. Read this once. Agents do not need it for every task.

## Node types and ids
| Type | Id pattern | One file per | Folder |
|---|---|---|---|
| Process | `proc.<name>` | process | `processes/` |
| Activity (shared step) | `act.<name>` | activity | `activities/` |
| Object (noun) | `obj.<name>` | domain group, anchored by id | `objects/` |
| Actor (agent, human, external, system) | `actor.<name>` | group, anchored by id | `actors/` |
| Policy | `pol.<name>` | policy | `policies/` |
| Event | `evt.<name>` | catalogue, anchored by id | `events.md` |

Ids use lowercase and underscores. File names use the same name with hyphens.

## Front matter
Every node file starts with a block between `---` lines. Required keys: `id`, `type`, `name`, `version`, `status`. Process and activity files add the relationship keys shown in their front matter. Keep front matter machine-readable: one key per line, lists in square brackets.

## Kosh bindings
Each process file also says how Kosh implements it. These keys are checked against the code by `tests/test_ontology.py`.

| Key | Meaning |
|---|---|
| `kosh_status` | `implemented`, `partial` (some steps run in Kosh) or `not_implemented` (Mitra says it is not available in chat and offers a callback) |
| `kosh_channels` | Which Mitra agents may be routed to it: `customer`, `visitor`, `officer`. Everything else can never select it |
| `kosh_tools` | Registry tools (`config/harness/tools.json`) that serve it. When this process is selected, a write or money tool outside this list is refused |
| `kosh_skills` | Workflow or skill ids (`workflow_catalogue.py`) that mean this process |
| `kosh_care` | Care intents (`backend/care.py`) that mean this process |
| `kosh_services` | Service catalogue ids (`service_requests.py`) |
| `kosh_tables` | Tables that back it today (`persistence.py`). Backing tables named in the body may be proposed tables that do not exist yet |
| `kosh_note` | One or two sentences: what Mitra's part is in Kosh. Sent to the model with the process |

## Status
`draft` (written, not reviewed) then `reviewed` (checked by the owner) then `approved` (cleared by compliance for use) then `deprecated`. **Every file in this release is `draft`.** An agent in production should only use `approved` files.

## Edge vocabulary
| Edge | Meaning |
|---|---|
| `START`, `ACTIVITY`, `NEXT`, `FINALIZE` | Sequencing inside a process (as in the Account Opening Agent diagram) |
| `USES` | A step uses a shared activity |
| `PERFORMED_BY` | Who does the step |
| `REQUIRES_APPROVAL_FROM` | Human gate |
| `READS`, `WRITES` | Data access to an object |
| `GOVERNED_BY` | A policy applies |
| `TRIGGERS`, `EMITS` | Event starts a process, process produces an event |
| `ESCALATES_TO` | Where to hand over |
| Object edges (`HOLDS`, `OWNED_BY`, `BECOMES` and so on) | Business relationships between nouns |

## Autonomy levels
| Level | Name | Meaning |
|---|---|---|
| A0 | Observe | Read-only. May answer questions and explain; changes nothing. |
| A1 | Recommend | Drafts, scores or recommends. A human performs the action. |
| A2 | Act with approval | Agent executes only after a named approver has approved in this run. |
| A3 | Act within limits | Agent executes alone inside policy limits and parameters; every action is audited; anything outside limits escalates. |

## Adding or changing a node
1. Check whether an existing activity already does the job. Reuse it. Do not copy it.
2. Create the file in the right folder with complete front matter and status `draft`.
3. Link it from every place that uses it (a process step, an actor, the routing table).
4. Run `python tools/validate_ontology.py` and fix every error.
5. The owner reviews, compliance approves, then set status to `approved` and bump the version.

## Step design
- Keep a process to 5 to 10 steps. If one step needs sub-steps, make it its own process.
- A step that is used by two or more processes becomes a shared activity.
- Every step that changes data names the object it writes.
- Every step that can hurt the customer or the bank has a gate, a limit or both.
