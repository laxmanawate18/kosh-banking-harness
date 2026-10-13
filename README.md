# Kosh — Secure Agentic Banking

Kosh is a hackathon prototype that demonstrates risk-based autonomy for banking agents. Mitra (the Antigravity AI banker) reasons and proposes; Sentinel, a deterministic policy and fraud engine, independently authorizes; a trusted browser flow collects approval; an idempotent mock ledger executes only permitted outcomes.

Backend code is organized under `backend/`: route modules own public, authentication, and session/service APIs; `chat_runtime.py` owns WebSocket lifecycles; `agent_config.py` owns Antigravity prompts and tool gates; and `conversations.py` owns database-backed chat persistence. `dev_ui.py` only assembles these components and starts FastAPI.

> Simulated banking environment. All customers, balances, transactions, alerts, approvals, and payments are dummy data. No real money or banking network is involved.

## What the demo proves

1. The Antigravity agent safely retrieves accounts, recent spending, bills, and alerts.
2. A known ₹2,430 Tata Power bill is low risk, but like every money movement it waits for the customer's approval in Kavach before it executes.
3. A new-beneficiary ₹75,000 transfer returns `CHALLENGE` and requires fresh Firebase phone verification in the trusted Kavach approval dialog.
4. A poisoned biller proposal to `fastcash@upi` returns `DENY` before ledger execution.
5. Repeated identical requests produce one ledger effect and return the existing receipt.
6. A protective debit-card freeze remains low friction and fully audited.
7. An approved savings-account application launches the Playwright RPA worker, enters the case in the local CBS maker screen, and shows all ten steps plus the returned CIF and account number to the officer.

## Run locally

```bash
cp .env.example .env
# Fill the Firebase project values and generate the listed secrets.
docker compose up -d postgres auth-postgres auth-server
source venv/bin/activate
pip install -r requirements.txt
venv/bin/python scripts/migrate_auth_subjects.py --apply
PORT=8017 python dev_ui.py
```

Open [http://127.0.0.1:8017](http://127.0.0.1:8017). The OAuth authority and its hosted sign-in/consent pages run on [http://127.0.0.1:8020](http://127.0.0.1:8020).

**On Windows (PowerShell)** the same steps are:

```powershell
Copy-Item .env.example .env
docker compose up -d postgres auth-postgres auth-server
venv\Scripts\Activate.ps1
pip install -r requirements.txt
python scripts\migrate_auth_subjects.py --apply
$env:PORT = 8017; python dev_ui.py
```

Use `venv\Scripts\python` wherever the commands below say `venv/bin/python`, and `venv\Scripts\pytest` for `venv/bin/pytest`.

**Signing in as a customer without Firebase.** Set `AUTH_DEMO_OTP=246810` for both the auth server and the app (`.env` or the shell). The sign-in page then accepts the registered demo number `+919876543210` with that code and sends no SMS. The deployed demo keeps it on so reviewers can sign in. Both `kosh-auth` (accepts the code) and `kosh-app` (shows it on the sign-in page) need `AUTH_DEMO_OTP` set; the release script keeps it if it is already set on the service, and never adds it.

**Frontend.** After changing anything in `frontend/`, run `npm run build` there: the app serves `frontend/dist`. `npm run dev` serves it live while you work.

Demo identities (local simulation only):

- Customer OAuth: the configured Firebase test phone and verification code
- Better Auth staff: `officer.mumbai` / `Officer@2468` (bank officer)
- Better Auth admin: `admin.kosh` / `Admin@2468` (Admin Panel: Mitra, ontology, cost, approvals; local only, production reads `kosh-admin-password`)

Customer sign-in verifies Firebase phone credentials at the isolated Better Auth service. Staff sign in there with username/password. Kosh is an OAuth resource server and BFF: it keeps authorization-code PKCE verifiers and rotating refresh tokens server-side, validates five-minute JWT access tokens through OIDC/JWKS, and exposes only an HttpOnly application cookie to the browser. OAuth consent and banking-purpose consent remain separate. Fresh Firebase reauthentication raises only the current OAuth session to L3 for five minutes.

Kosh runs only with `AUTH_MODE=oidc`; legacy password, direct OTP, and direct Firebase login endpoints have been removed. Local Firebase app verification is disabled only for `AUTH_FIREBASE_TEST_PHONE`; real SMS must use the configured authorized HTTPS auth domain.
Production must provide Firebase Admin application-default or service-account credentials so every ID token is checked for revocation; the development-only test-number path still verifies token signature, issuer, audience, phone identity, and recent authentication.

The existing `.env` may use Gemini API or Vertex credentials. The product fixes the agent model to `gemini-3.8-flash`, served from the Vertex `global` endpoint (`GOOGLE_CLOUD_LOCATION=global`); model, reasoning, project, and tool controls are intentionally absent from the customer UI.

Signed-out visitors use a separate Antigravity sales configuration with four read-only public catalogue tools. The sales journey keeps only visitor-stated, non-sensitive preferences in memory for the WebSocket lifetime and progresses through discovery, clarification, recommendation, explanation, and a trusted application handoff. Product cards, summaries, disclosures, and next actions are assembled deterministically. Generated copy is rejected when it introduces an unreviewed numeric fact, competitor claim, approval promise, guarantee, pressure tactic, or system-prompt extraction attempt.

## Judge walkthrough

Click **Reset demo**, then run these prompts/actions in order:

1. `Show my accounts and recent spending.`
2. `Pay my Tata Power electricity bill.`
3. `Transfer ₹75,000 to Vikram.` — approve the exact details after a fresh Firebase phone reauthentication.
4. Click **Replay poisoned biller** — verify the stable mismatch, mule, and prompt-injection reason codes and unchanged balance.
5. `Show security alerts and freeze my debit card.`

The left side shows customer state, the centre shows agent proposals and bank-confirmed components, and the dark right rail shows reproducible Sentinel risk-decision facts. It never exposes private model reasoning.

### Account-opening RPA walkthrough

1. Submit the **Savings account opening** workflow as a customer.
2. Sign in through **Staff & Password** with `officer.mumbai` / `Officer@2468`.
3. Open **Review queue**, select the savings-account case, and review the structured applicant, identity, address, scheme, deposit, and nominee details.
4. Choose **Approve and start CBS entry**. The dialog remains open and shows the live AO-001 through AO-010 Playwright steps.
5. Verify that the result contains identifiers returned by the local CBS confirmation page and a `PENDING_CHECKER_APPROVAL` CBS status.

The conversational banker uses the Antigravity SDK. The RPA executor is a separate deterministic Playwright worker; it does not call another LLM or another Antigravity agent.

## Security architecture

```text
Firebase phone / staff credentials ──> isolated Better Auth authority
                                              │ OAuth 2.1/OIDC + PKCE
Kosh browser BFF / delegated chatbot     ─────┘
                      │ scoped five-minute JWTs; encrypted rotating refresh grants
                      ▼
authenticated FastAPI ──> one Antigravity agent/session
           │
                     seven narrow native tools
           │
                       intent-bound proposals
           ▼
                     deterministic Sentinel PDP
                     ALLOW | CHALLENGE | DENY
                                  │
                     internal HMAC authorization
                                  ▼
                     exactly-once mock executor
                                  │
                    PostgreSQL transaction boundary
                    JSONB banking adapter + typed auth,
                    consent, request, approval and audit tables
```

The agent has no general mutation capability. It receives exactly these native tools:

- `get_customer_summary()`
- `get_transaction_history(account_id=None, limit=10)`
- `get_outstanding_bills()`
- `get_security_alerts()`
- `propose_bill_payment(bill_id, source_account_id)`
- `propose_transfer(beneficiary_id, amount_minor, source_account_id, note="")`
- `freeze_card(card_id, reason)`

Antigravity built-in tools and subagents are disabled. A pre-tool hook rejects unknown tools, unexpected fields, invalid money shapes, and authentication-secret arguments. This hook is defence-in-depth: proposal and execution services independently verify intent, ownership, delegation, bill binding, beneficiary reputation, decision digest, token audience/expiry/single-use, challenge state, and idempotency.

## Data and state

- `data/banking_seed.json` is the immutable INR demo fixture.
- PostgreSQL 16 is the durable runtime store. `docker-compose.yml` exposes it locally on port `5433`.
- Banking state uses a transactionally locked JSONB aggregate so the proven Kosh banking state machine remains atomic; auth sessions, consent, conversations, service requests, officer actions, documents, model registry, and audit events use typed relational tables.
- Alembic owns schema versions in `migrations/`.
- Money is integer paise—never floating point.
- Every banking mutation uses `SELECT … FOR UPDATE` and commits balance, receipt, idempotency, decision, and audit effects in one database transaction.
- Audit records are append-only at the application boundary and HMAC hash-chained. Demo reset restores banking state but preserves relational audit evidence.

`POST /api/demo/reset` restores customer and domain state to the deterministic fixture. The main collections include accounts, cards, bills, beneficiaries, transactions, alerts, delegations, intents, payment intents, decisions, challenges, idempotency records, audit events, devices, and demo scenarios.

## Sentinel risk rules

Sentinel evaluates identifier/schema validity, delegation, ownership and domain state, intent match, replay, provenance, fraud signals, and final disposition in a fixed order. Hard failures—including intent mismatch, blocked mule, changed idempotency parameters, unauthorized source/destination, and invalid bill binding—always deny.

Soft signals include new beneficiary, amount above baseline, high value, new device, unusual trusted-device time input, velocity, recurring bill, known device, prior beneficiary, and injection provenance. All output uses stable reason codes and the versioned `sentinel-demo-v1` policy. Person-to-person transfers always require at least a challenge.

## API surface

- `GET /api/auth/start`, `GET /api/auth/callback`, `GET /api/auth/session`, `POST /api/auth/logout`
- `GET /api/chat/auth/start`, `GET /api/chat/oauth/callback`, and single-use 30-second WebSocket tickets
- `POST /api/auth/firebase-step-up`, `POST|DELETE /api/consent`
- Authenticated, owner-scoped session CRUD and `/ws/chat`
- `GET /api/dashboard`
- `GET /api/sentinel/events?session_id=...`
- `POST /api/challenges/{challenge_id}/verify`
- `POST /api/demo/reset`
- `POST /api/demo/replay/{scenario_id}`
- `GET /api/demo/config`
- `GET /api/services`, `GET|POST /api/service-requests`
- `GET /api/officer/queue`, `POST /api/officer/requests/{id}/decision`
- `/api/admin/*` (ADMIN role only): skills, data sources, ontology and its approvals, usage and cost, quality, prompt-version approval, kill switches, audit check, customer-deletion approval
- `GET /api/officer/requests/{id}/rpa` for the sanitized live RPA timeline and result

Frontend rendering is allowlisted to fixed local presentation types. Tool data cannot provide HTML, scripts, CSS classes, URLs, or event handlers.

## Verification

Point the tests at a throwaway database first. With the default `.env`, some tests try to reach the database that file names, so set a local SQLite file and turn the Cloud SQL sync off:

```bash
export SENTINEL_DATABASE_URL=sqlite+pysqlite:///$TMPDIR/kosh-test.sqlite3   # PowerShell: $env:SENTINEL_DATABASE_URL = "sqlite+pysqlite:///$env:TEMP/kosh-test.sqlite3"
export ENABLE_CLOUD_SQL_SYNC=false
```

```bash
venv/bin/python -m unittest discover -v
venv/bin/pytest -q
venv/bin/python -m playwright install chromium
# With the app running on PORT=8018 in another terminal:
```

The suite covers atomic/reset behavior, integer money, concurrency, exactly-once execution, hard-deny and risk-score matrices, OAuth state/PKCE/scope enforcement, WebSocket ticket replay, challenge tampering, HMAC token misuse/reuse, poisoned replay, secure Antigravity configuration, REST/WebSocket compatibility, masked dashboard data, and sanitized event output.

## Prototype limits

This is not a production-secure or compliant bank. All 38 PRD services have catalogue metadata and a durable intake/approval path; only the Kosh banking demo actions have specialized execution adapters. Real CBS/CRM/DMS integrations, document malware scanning/OCR, passkeys, device attestation, KYC, AML/sanctions/network integrations, multilingual quality certification, cloud deployment, and operational resilience remain outside this local build. Firebase test-number behavior and checked-in local staff credentials are hackathon-only. Production requires HTTPS, managed secrets and signing keys, cryptographic device binding, formal policy governance, availability monitoring, and independent security testing.
