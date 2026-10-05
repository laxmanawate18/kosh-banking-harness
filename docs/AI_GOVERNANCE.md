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

1. Everything that shapes Mitra's replies (instructions, language rules and skills) is hashed into a **prompt version**. The running version registers itself at startup, and every conversation turn records it.
2. Before release, run the evaluation set: `venv/bin/python tests/eval/run_eval.py --record`. It holds 258 cases across 19 categories, covering product facts, unknown information, rival banks, jailbreaks, prompt probing, fraud, complaints, handoff, distress, lending, investments, AI disclosure, off-topic requests, Hindi, Marathi and Hinglish, answer style, fairness groups, multi-turn conversations, and 28 signed-in customer cases (including security cases). The result is stored on that version.
3. **Release gate:** at least 95% overall, **100% on care_fraud, jailbreak, prompt_probe and customer_security**, and every fairness group passing. This is enforced in code: `run_eval.py` exits with a failure and records the gate result on the version, and approval is refused unless the version's latest run passed. The AI owner then approves the version in [Mitra quality → Prompt versions], with a note on what was reviewed.
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
| MCP gateway (`/mcp`) | The single entry point for external agents: OAuth bearer tokens from Kosh's authorization server, bound to one customer, with the same registry, scopes, kill switch, rate limit and audit as Mitra. An agent can only propose money movement. |
| Outside-agent login | The bank registers each assistant app it allows as its own OAuth client; there is no open self-registration. The customer sees the app's name and what it can do on the consent page, and can withdraw its access at any time under Security → Connected assistant apps. Agent tokens are issued for the gateway (`/mcp`) only and are refused by Kosh's own API and chat; Kosh's own tokens are refused by the gateway. |
| Approvals inbox | Payments proposed by any agent wait on the customer's overview page and execute only after the customer's step-up approval of that exact transaction in Kavach. |
| Core banking boundary (`core_banking.py`) | Money and card changes reach the system of record through one adapter, idempotent on Kosh's key. A reconciliation every 5 minutes settles payments left mid-post and reports any mismatch (CRITICAL audit event); officers can run it on demand. |
| Repeat safety | A write tool called again with the same arguments in a session within 10 minutes returns its first result. |
| Durable automation | Approved core-banking work is claimed atomically in the database and re-queued after a restart, so it runs exactly once. |

**Registering an assistant app.** On the authorization server set `AUTH_AGENT_CLIENTS`, a JSON list such as
`[{"id": "kosh-agent-claude", "name": "Claude", "redirects": ["https://claude.ai/api/mcp/auth_callback"], "scopes": ["banking.read", "banking.propose"]}]`
(add `"secret"` for a confidential client; without one the client is public and must use PKCE), and on Kosh set
`OAUTH_AGENT_CLIENT_IDS=kosh-agent-claude`. Restart both; the client is created at start-up. The app connects to
`https://<kosh host>/mcp` and finds the authorization server through `/.well-known/oauth-protected-resource/mcp`.

## 6. Data protection (DPDP Act 2023)

- **Retention:** chat transcripts and feedback are deleted after **90 days** (`CHAT_RETENTION_DAYS`); a daily job enforces this. A visitor's in-progress application details are removed from chat memory after 24 hours. The turn log (no text) is kept for 1 year.
- **Masking at rest:** PAN, Aadhaar, card and mobile numbers are masked before a transcript and its tool traces are stored. The live conversation is not affected. A visitor's in-progress application is encrypted at rest.
- **Keys:** in production the app refuses to start without its payment-token, audit and document encryption keys (`SENTINEL_DEMO_SECRET`, `SENTINEL_AUDIT_HMAC_KEY`, `SENTINEL_DOCUMENT_KEY`).
- **Notice:** the chat box states that Mitra is an AI, that chats are kept for 90 days, and that customers must never share an OTP or PIN.
- **Purpose limitation:** personalised offers use customer data only with the separate marketing consent, which can be withdrawn in Settings.

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
