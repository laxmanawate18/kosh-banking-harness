---
id: readme
type: index
name: Banking Business Ontology
version: 0.1.0
status: draft
---
# Banking Business Ontology

A business-facing ontology for a bank: **what the organisation does, who does it, and what agents are asked to perform.** It holds 23 processes, 20 shared activities, 45 business objects, 32 actors, 29 events and 5 policies, split across linked Markdown files so an agent loads only what its task needs.

> **Status: draft v0.1.** Written as a design starting point. Compliance, legal and each process owner must review before production. Parameters such as limits and cooling-off periods are intentionally unset. See [Approval Matrix](policies/approval-matrix.md).

## For an agent: how to use this (the protocol)
1. **Route.** Open [routing.md](routing.md). Match the task or event to one process. If nothing matches, stop and hand over (guardrail G1).
2. **Load the process file** (`processes/<name>.md`). Read *Use this process when*, *Do not use it when*, and the *Flow* table.
3. **Work step by step.** Before each step, open its linked activity file (`activities/<name>.md`) and follow its rules.
4. **Check authority.** Look at the step's Autonomy and Approval gate. Above your ceiling or gated means route to the approver. You never approve your own work.
5. **Check policy when named.** Open the policy files the process or activity lists. At minimum know [agent-guardrails](policies/agent-guardrails.md).
6. **Handle exceptions** from the process's *Exceptions* table instead of improvising.
7. **Emit evidence** for every activity as in [audit-and-evidence](policies/audit-and-evidence.md).
8. **Finish** only when the process's *Finalize* condition is true and the outcome is written back.

Typical load for one task: 1 routing file, 1 process file, 3 to 8 activity files, 2 to 3 policy files. That is a small fraction of the whole set.

## In Kosh
Kosh's server reads this folder (`backend/ontology.py`): it routes each Mitra turn to one process, sends the model only that process's agent view, and records the process on the turn. See `docs/ONTOLOGY.md`.

## Folder map
| Path | Contents | Load when |
|---|---|---|
| `routing.md` | Task, event and domain routing, and confusable processes | Always first |
| `processes/` | One file per business process (the hubs) | A task matches it |
| `activities/` | One file per shared, reusable step | A process step links to it |
| `objects/` | Business nouns grouped by domain, with edges and backing tables | You need to know what a thing is or where it lives |
| `actors/` | AI agents, human roles, external parties | You need to know who may do or approve something |
| `policies/` | Approval matrix, guardrails, consent, authentication, audit | A step or activity names it |
| `events.md` | Business events and the processes they start | Event-driven tasks |
| `conventions.md` | How the files are written and extended | Editing the ontology |
| `edges.md` | Flat list of every edge for tooling | Graph loaders only. Do not load into an agent |
| `tools/validate_ontology.py` | Checks links, ids and front matter | Before every change is merged |

## Why multiple files instead of one
1. **Context economy.** An agent processing a payment needs one process and a handful of activities, not every loan, claim and report definition. Loading only the relevant files keeps the context small and the attention on what matters.
2. **Progressive disclosure.** The agent reads routing, then a process, then an activity at the moment it needs it. Detail arrives just in time.
3. **One source of truth.** Verify Identity, Check Consent and Post to Ledger are used by many processes. Each is defined once. Change it once and every process inherits the change.
4. **Ownership and change control.** Files map to owners: compliance owns policies, lending owns lending processes. Each file has its own version and status, and reviews and diffs stay small.
5. **Least privilege for knowledge.** You can give the payments agent only the payments folders. It cannot be steered by loan or AML procedure it was never meant to run.
6. **Testable.** Stable ids and links can be checked automatically. The validator fails the build on a broken link or a missing node.
7. **Parallel work.** Different teams can edit different files without merge conflicts.

**Trade-offs.** More cross-references to keep correct (the validator handles this), and an agent must follow links instead of reading one page. Objects and actors are grouped by domain on purpose: they are small and read together, so one file per object would add overhead without benefit.

## Known gaps
- Policy parameters (limits, cooling-off periods, attempts) are unset by design and must be filled in by the bank.
- `obj.data_subject_request` has no database table yet.
- Regulatory references are deliberately generic. Add the rules of your jurisdiction.
- Backing table names in the body refer to the Sentinel schema and the proposed additions in `sentinel_updated_schema.xlsx`; many of those tables do not exist yet. What Kosh actually uses is in each process's `kosh_tables`, which the tests check against the code.
- `edges.md` lists 958 edges generated from these files. Edit the source files, not that list.

## Origin
Object layer follows the customer-centric ontology idea in the Palantir Foundry customer-centric banking whitepaper (Customer, Product, Offer, Segment, Channel, Campaign, Relationship Manager, Risk Factor). Process layer follows the hub-and-spoke Account Opening Agent diagram (START, ACTIVITY, NEXT, FINALIZE). Processes beyond account opening are original designs.
