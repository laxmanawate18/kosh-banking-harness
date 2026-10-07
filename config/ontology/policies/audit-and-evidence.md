---
id: pol.audit_evidence
type: policy
name: Audit and Evidence
version: 0.1.0
status: draft
owner: compliance_officer
---
# Audit and Evidence

Every activity emits at least one audit event. Process files and activity files list the event types under **Evidence**.

## Event shape
Write to `audit_events`. The fields map as follows.

| Field | What to put |
|---|---|
| `event_type` | The event type from the activity file (for example `kyc.identity_verified`) |
| `service_id` | The process id (for example `account_opening`) |
| `actor` | Agent id, human id or `system` |
| `session_id`, `customer_id_token` | Conversation session and the tokenised customer id, never the raw id |
| `model_version`, `prompt_version`, `policy_version` | Versions in force when the decision was made |
| `consent_id` | The consent relied on, if any |
| `approval_request_id`, `approver_id` | Set for approved actions |
| `severity` | `info`, `warning` or `critical` |
| `summary` | One plain sentence |
| `details` | Structured facts. No raw personal data. |

## Rules
1. **Append only.** The chain is hash-linked (`previous_hash`, `integrity_hash`). Never edit or delete an event. To correct one, write a new event that references it.
2. **Evidence before effect.** Record the decision and its inputs when you decide, not afterwards from memory.
3. **No raw PII.** Use tokens, hashes and masked values.
4. **Say why.** Decisions include reason codes. Rejections and overrides include the written justification.
5. **Event names** use `domain.action` in lowercase with underscores.
6. **Approvals** record who approved, what scope, and when it expires.
7. Reading the audit trail never changes it. Agents have no update or delete rights on it.

## Kosh event types today
Kosh's audit chain already uses its own upper-case event types. They are kept as they are: renaming would break the verifiable chain. The ontology names above are the target vocabulary, mapped like this.

| Ontology event | Kosh `audit_events.event_type` |
|---|---|
| any agent step (allowed or refused) | `AGENT_TOOL_ALLOWED`, `AGENT_TOOL_DENIED` (with `details.process`, the ontology process in force) |
| any agent step (result) | `AGENT_TOOL_COMPLETED`, `AGENT_TOOL_FAILED` |
| `payment.risk_decision` | the Sentinel decision stored in `bank_sentinel_decisions` with `policy_version` |
| `case.opened` | `SERVICE_REQUEST_CREATED`, and care cases in `care_cases` |
| `approval.decided` | officer decisions in `approval_actions` (four-eyes) |
| `ledger.reconciled` | `RECONCILIATION_RUN` |
| `privacy.withheld` | `LLM_BOUNDARY_WITHHELD` (data stopped on its way to the model) |
| `copilot.turn`, `copilot.draft` | `COPILOT_TURN`, `COPILOT_DRAFT_RECORDED` |
