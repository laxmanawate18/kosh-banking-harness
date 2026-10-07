# Mitra: AI governance

Mitra is Kosh's AI assistant for visitors and signed-in customers. This page describes who owns it, how changes are approved, what is monitored and how customers are protected. Every control named here exists in the product; the officer console locations are given in brackets.

## 1. Ownership and review

| Role | Responsibility |
|---|---|
| **AI owner** (`AI_OWNER` setting, shown in [Operations → Mitra quality]) | Accountable for Mitra's behaviour; approves every prompt version before it goes live; chairs the quarterly review. |
| Compliance | Reviews the response rules (section 3), complaint and fraud scripts, and evaluation results each quarter. |
| Customer care | Works the [Customer care] queue: complaints, callbacks, fraud reports and hardship requests. |
| Engineering | Runs the evaluation set on every change and keeps the audit trail. |

**Quarterly review:** evaluation pass rate by category, withheld-reply and refusal rates, 👎 feedback themes, complaint volume and overdue cases, fairness results, and any incidents.

## 2. Change control

1. Everything that shapes Mitra's replies (instructions, language rules, skills, the whole tool registry including what each tool lets a model read, the policy and the model) is hashed into a **prompt version**. The running version registers itself at startup, and every conversation turn records it.
2. Before release, run the evaluation set: `venv/bin/python tests/eval/run_eval.py --record`. It holds 294 cases across 21 categories, covering product facts, unknown information, rival banks, jailbreaks, prompt probing, fraud, complaints, handoff, distress, lending, investments, AI disclosure, off-topic requests, Hindi, Marathi and Hinglish, answer style, fairness groups, multi-turn conversations, 28 signed-in customer cases (including security cases) and 10 data-minimisation cases (no identifier, figure or placeholder reaches the model or leaks into a reply). The result is stored on that version.
3. **Release gate:** at least 95% overall, **100% on care_fraud, jailbreak, prompt_probe, customer_security, officer_copilot and data_minimisation**, and every fairness group passing. This is enforced in code: `run_eval.py` exits with a failure and records the gate result on the version, and approval is refused unless the version's latest run passed. The AI owner then approves the version in [Mitra quality → Prompt versions], with a note on what was reviewed.
4. **Production runs only approved versions.** Until the running prompt version is approved, Mitra answers every chat with a fixed "paused" message and the helpline; the officer console, where approval happens, keeps working. `MITRA_ALLOW_UNAPPROVED=true` is the emergency override and must be recorded as an incident.
5. **Rollback:** redeploy the previous image. Its prompt version is still in the registry with its evaluation and approval.

## 3. Response rules (enforced in code, then in instructions)

| Rule | How it is enforced |
|---|---|
| Stays Mitra; no role-play, persona or "developer mode" | Refused before the model sees the message (English, Hindi, Marathi) |
| Never reveals instructions, architecture or tools | Refused before the model; replies are checked for leaks |
| No rival-bank comparisons or claims | Replies naming another bank become a polite decline listing Kosh's own products (visitor and signed-in) |
| No unapproved rates, superlatives or approval promises | Visitor replies are checked against the published catalogue; unsafe sales phrases are blocked on both channels. A withheld visitor reply gets one rewrite, checked again, before the safe reply is used |
| "I don't have that information" instead of guessing | Instruction, plus a fallback that never repeats itself |
| Fraud emergency | A fixed script covering the 1930 helpline, cybercrime.gov.in, card freeze and RBI's 3-day reporting rule. It never goes through the model. Signed-in customers get a HIGH-priority fraud case opened. |
| Self-harm | The Tele-MANAS 14416 helpline is shown first; there is no selling |
| Distress or hardship | No selling in that chat, and offers are paused for 90 days; hardship requests are routed to care |
| Complaints | Mitra registers the complaint with a reference, gives the 30-day resolution timeline and the RBI Ombudsman path (cms.rbi.org.in), and sends an SMS |
| "Talk to a person" | The helpline plus a callback case (within 1 working day). Mitra never talks the customer out of it. |
| Responsible lending | EMI is checked against income (50% ceiling) before any loan pitch; the Key Fact Statement and APR are mentioned; approval is never promised |
| Investments and insurance | General information only; a market-risk note is appended; insurance is always optional |
| AI disclosure | Mitra introduces itself as an AI assistant; a notice sits under every chat box |
| Money movement | Every bill payment and transfer needs the customer's own approval in Kavach (fresh verification), however low the risk. The delegated daily limit counts everything already moved that day. Card freezes run instantly because they protect the customer; unfreezing is confirmed by the bank |
| Officer decisions | Four-eyes rule: an officer cannot decide a request on their own customer account, and a request they escalated must be approved by a different officer |
| Abuse limits | Chat messages are limited per minute per user (or per address for visitors); a signed-in turn may call at most 12 tools |
| Personalised offers | Only with separate marketing consent, KYC verified, frequency caps and suppression (see the offer engine) |

## 4. Monitoring ([Operations → Mitra quality])

Each turn records its channel, language, outcome (answered, withheld, refused, fraud script, paused, error), the reason a reply was withheld, any care intents, latency, model, prompt version, and input and output tokens. **No message text is stored in this log.**

**Audit trail.** Every tool the agent asks for is recorded in the tamper-evident audit chain: the tool, its arguments (identifiers masked, secrets removed), whether it was allowed or denied and why, and its result or error. Every record's hash covers only stored fields, so the chain can be re-checked at any time ([GET /api/officer/audit/verify]); an altered or removed record is reported.

**Kill switches.** An officer can pause Mitra for visitors, for signed-in customers, or block single tools, instantly and across all instances ([PUT /api/officer/controls], a reason is required and audited). A paused channel answers with a fixed message and the helpline; the fraud script and the self-harm helpline still run.

**Model resilience.** Transient model errors are retried three times with backoff. If a signed-in turn still fails before any tool ran or any text was produced, it is retried once on the backup model (`MITRA_FALLBACK_MODEL`). Customers never see raw error text.

**Alert thresholds**, reviewed weekly:
- Withheld replies above 10%.
- Errors above 2%.
- p90 latency above 30 s.
- 👎 feedback above 15% of rated replies.
- Any overdue fraud case.

Customers can rate any reply 👍 or 👎. Negative ratings appear with the masked reply for review.

## 5. The banking harness

Every agent, Mitra or an external one, reaches Kosh's banking capabilities through one harness:

| Part | What it guarantees |
|---|---|
| Tool registry (`config/harness/tools.json`) | Every tool an agent may call, per channel, with what it does (read, write, money), its risk, who approves its effect (none, the customer in Kavach, an officer), the OAuth scope it needs and its typed, bounded arguments. Undeclared tools or arguments are refused, and a test fails if code and registry drift apart. |
| Policy (`config/harness/policy.json`) | Sentinel's thresholds, risk weights, velocity and approval rules, challenge expiry and chat limits. Its version and a hash of the file are recorded on every decision, so an unreviewed edit is visible. |
| MCP gateway (`/mcp`) | The single entry point for external agents: OAuth bearer tokens from Kosh's authorization server, bound to one customer, with the same registry, scopes, kill switch, rate limit and audit as Mitra. An agent can only propose money movement. An outside agent is another company's model, so it gets each tool's model view with **no amounts at all** ("shown only in the Kosh app"). |
| Outside-agent login | The bank registers each assistant app it allows as its own OAuth client; there is no open self-registration. The customer sees the app's name and what it can do on the consent page, and can withdraw its access at any time under Security → Connected assistant apps. Agent tokens are issued for the gateway (`/mcp`) only and are refused by Kosh's own API and chat; Kosh's own tokens are refused by the gateway. |
| Approvals inbox | Payments proposed by any agent wait on the customer's overview page and execute only after the customer's step-up approval of that exact transaction in Kavach. |
| Core banking boundary (`core_banking.py`) | Money and card changes reach the system of record through one adapter, idempotent on Kosh's key. A reconciliation every 5 minutes settles payments left mid-post and reports any mismatch (CRITICAL audit event); officers can run it on demand. |
| Officer copilot | The second agent on the harness, built from config only: its tools are the `officer` channel of the registry, its instructions are `config/harness/agents/officer_copilot.md`, and it uses the shared gate, audit, kill switch (`OFFICER`) and model settings. It reads the queue and records draft recommendations; it never decides. Its tool results pass the LLM boundary like Mitra's: it reads which details a request holds and the server's discrepancy findings, not the values. |
| Repeat safety | A write tool called again with the same arguments in a session within 10 minutes returns its first result. |
| Durable automation | Approved core-banking work is claimed atomically in the database and re-queued after a restart, so it runs exactly once. |

**Registering an assistant app.** On the authorization server set `AUTH_AGENT_CLIENTS`, a JSON list such as
`[{"id": "kosh-agent-claude", "name": "Claude", "redirects": ["https://claude.ai/api/mcp/auth_callback"], "scopes": ["banking.read", "banking.propose"]}]`
(add `"secret"` for a confidential client; without one the client is public and must use PKCE), and on Kosh set
`OAUTH_AGENT_CLIENT_IDS=kosh-agent-claude`. Restart both; the client is created at start-up. The app connects to
`https://<kosh host>/mcp` and finds the authorization server through `/.well-known/oauth-protected-resource/mcp`.

## 6. Data protection (DPDP Act 2023)

### What reaches an AI model (the LLM boundary, `backend/llm_boundary.py`)

A model needs to understand the request and word the answer; it never needs the customer's identifiers or figures. Every
field is one of four classes:

| Class | Examples | To a model? |
|---|---|---|
| Restricted | full account, CIF or card number, PAN, Aadhaar, date of birth, address, OTPs and Kavach codes, device ids, the customer id, document images and OCR text | **Never** |
| Confidential | balances, amounts, income, PEP and risk flags | **No.** Amounts become placeholders (`{{amt_3}}`) that the server fills in the reply; arithmetic is done by server tools (`check_funds`, `summarise_spending`, `check_loan_affordability`) that return conclusions |
| Internal | first name, masked numbers (last 4), account type, statuses, due dates, internal record ids such as `ACC-…` (opaque, and the gate binds them to the signed-in customer) | Yes |
| Public | product catalogue, rates, help content | Yes |

How it is enforced:
1. **Model view per tool, deny by default.** Each tool in `config/harness/tools.json` declares `model_view`: the fields a model may read and which are amounts. Anything undeclared is dropped. The full result goes only to the customer's screen. A test fails if any tool lacks a model view or if a view exposes a restricted field.
2. **Typed identifiers become tags.** PAN, Aadhaar, card, account, IFSC, UPI id, email and mobile numbers in what a person types (and in history fed back to a new agent) are replaced by tags such as `[PAN_1]`; tools receive the real value on the server, and replies show it masked. One-time codes are dropped.
3. **Safety net.** Every payload bound for a model is checked for this customer's real identifiers and for full PAN and card-number shapes; anything found is replaced and an `LLM_BOUNDARY_WITHHELD` audit event is recorded.
4. **No details in chat.** Visitors apply in the website's secure form (Mitra only opens it); KYC documents are read by the bank's own parser, and Mitra learns only which details were found.
5. **The system prompt** carries the first name and KYC status only: no customer id, full name, lead amounts or notes.
6. **Voice** uses Cloud Speech-to-Text (`chirp_2` in `asia-southeast1`, Singapore: Mumbai no longer serves a model for English, Hindi and Marathi; set `KOSH_SPEECH_LOCATION`/`KOSH_SPEECH_MODEL` to move back when it does) and Cloud Text-to-Speech, not a generative model.
7. **Logs** record why a reply was replaced and its length, never its text.

Known limits: the main model is served from Vertex AI's `global` endpoint unless `GOOGLE_CLOUD_LOCATION` pins a region
where it is available; Vertex request logging must stay off and the zero-data-retention / abuse-monitoring exception is
requested from Google by the bank, not set in code. Names of payees remain visible to the model so it can resolve
"send money to Riya".

- **Retention:** chat transcripts and feedback are deleted after **90 days** (`CHAT_RETENTION_DAYS`); a daily job enforces this. Visitors type application details only in the secure form, so chat memory holds none. The turn log (no text) is kept for 1 year.
- **Masking at rest:** PAN, Aadhaar, card and mobile numbers are masked before a transcript and its tool traces are stored. The live conversation is not affected. Visitor chat memory (stage, products considered, offers shown) is encrypted at rest.
- **Keys:** in production the app refuses to start without its payment-token, audit and document encryption keys (`SENTINEL_DEMO_SECRET`, `SENTINEL_AUDIT_HMAC_KEY`, `SENTINEL_DOCUMENT_KEY`). The audit trail's customer pseudonym is a keyed HMAC (labelled use of the audit key), so it cannot be reversed by hashing guessable customer ids.
- **Notice:** the chat box states that Mitra is an AI, that chats are kept for 90 days, and that customers must never share an OTP or PIN.
- **Purpose limitation:** personalised offers use customer data only with the separate marketing consent, which can be withdrawn in Settings.
- **Consent per action:** every agent tool names, in the tool registry, the consent it relies on (a digital-banking scope such as `accounts:read` or `payments:propose`, the separate marketing consent, or none for public information). The gate refuses the action without that active consent, for Mitra and for outside agents alike, and records the consent id on the audit record. Complaints, callbacks and declining an offer are never gated.

## 7. Fairness

Fairness groups in the evaluation set ask the same need with different names, genders, religions and regions. All members must receive the same Kosh products. A failure blocks release.

## 8. Incidents

An incident is a wrong or harmful reply reaching a customer (a mis-sold product, a leaked instruction, wrong fraud guidance), or a failure in a care flow. The process:
1. Customer care logs it.
2. The AI owner decides within 1 working day whether to roll back.
3. Engineering adds the case to the evaluation set so it can't recur.
4. Compliance records it for the quarterly review and, where required, for regulatory reporting.

## 9. References

- RBI, *Framework for Responsible and Ethical Enablement of AI (FREE-AI)*, 2025.
- RBI Integrated Ombudsman Scheme 2021.
- RBI Charter of Customer Rights and Fair Practices Code.
- RBI circular on limiting customer liability in unauthorised electronic banking transactions.
- Digital Personal Data Protection Act 2023.
- SEBI (Investment Advisers) Regulations.
- IRDAI corporate agency rules.

These inform the design; they are not a certification of compliance.
