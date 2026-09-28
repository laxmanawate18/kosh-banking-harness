# Kosh — End-to-End Test Report

**Date:** 28 September 2026 · **Scope:** the whole product, tested end to end, then fixed, then tested again · **Build tested:** this repository (local git history below)

## 1. Summary

| | Pass 1 (original code) | Pass 2 (after fixes) |
|---|---|---|
| End-to-end checks (real browser + API) | 74 checks: 47 passed · 27 failed | **76 checks: 76 passed · 0 failed** |
| Python test suites (17 files) | 96 passed · 36 failed | 130 passed · 0 failed |
| **Final retest after the velocity-policy change** | | **76/76 end-to-end · 132/132 Python** |
| Frontend unit tests · type check | 12/12 · clean | 12/12 · clean |
| Auth-server type check · tests | clean · 1/1 | clean · 1/1 |

- **26 product defects fixed.** Together they explain every failure in pass 1: 27 end-to-end checks and 36 unit tests. The list also includes one defect that first showed up in pass 2, and a few regressions found while reviewing the fixes. Three were critical security holes: a public applicant could take over the bank officer's login; the public demo code `246810` let any signed-in customer approve payments (the test executed a ₹90,000 transfer with it); and anyone on the network could create or delete sign-ins on the identity server.
- **Product name:** everything a customer, officer or reader sees now says **Kosh**. **Sentinel** appears only for the fraud and risk engine, and **Kavach** only for the trusted payment-approval dialog. The browser-side script that rewrote "Sentinel" into "Kosh" at runtime is gone; names are fixed at the source.
- **Model:** Mitra runs on **Gemini 3.8 Flash** everywhere. That model is served only from the Vertex **`global`** endpoint (it returns 404 in `us-central1`), so the location changed too. Pass 2 confirmed 3.8 Flash at runtime.
- **Pass 2: every check passed.** That's 76 of 76 end-to-end checks plus every Python, frontend and auth-server suite. Section 6 lists the open items: recommendations and one policy question, none of them failing tests.

## 2. How the product was tested

- **Real stack, run locally:** the Kosh app (FastAPI plus the React build), the Better Auth identity server, and Postgres 18 for the identity server. It uses a fresh SQLite banking database seeded from `data/banking_seed.json` for each pass. Your working database `data/sentinel_local.sqlite3` was not touched; a backup is in `.local/db-backup/`.
- **Live Google Cloud services:** Gemini through Vertex, Firebase phone sign-in and step-up (with the Firebase console test number +91 98765 43210 and code 246810), and Cloud Vision OCR on synthetic PAN and passport images.
- **Nothing left the machine except the Google calls:** Cloud SQL sync was off. All email went to a local mail catcher (`.local/mail/`), and the tests read the credentials emails from there. No real email was sent.
- **Driven like a user:** a headless Chrome browser played visitor, customer (Aarav Mehta) and bank officer (Neha Rao), with direct API calls for the security checks. Each pass started from freshly reset databases and ran every stage in order: public site → customer → officer → takeover attempt → payments → account opening with RPA → security → brand and model.
- **Evidence:** every check stores a PASS / FAIL / BLOCKED result, its details and a screenshot. Pass 1 is in `.local/e2e-results/run1-final/`, pass 2 in `.local/e2e-results/run2/`. The harness is `tests/e2e/kosh_e2e.py`.
- **Chat replies are judged by behaviour, not wording:** the right tool called, the right Sentinel decision, money moved exactly once, no leaked internals. Gemini's wording varies between runs.

## 3. Results by check

**A. Public site & visitor**

| ID | Check | Pass 1 | Pass 2 |
|---|---|---|---|
| A01 | Home page renders with Kosh branding | ✅ Pass | ✅ Pass |
| A02 | Public pages (Accounts, Cards, Loans, Rates, Calculators, Help) render | ✅ Pass | ✅ Pass |
| A03 | Language switch to Hindi and Marathi translates the page | ✅ Pass | ✅ Pass |
| A04 | No 'Sentinel' product naming on public pages | ✅ Pass | ✅ Pass |
| A05 | Visitor Mitra answers a product question | ✅ Pass | ✅ Pass |
| A06 | Visitor Mitra hides internal SUGGESTIONS markup from the customer | ❌ Fail | ✅ Pass |
| A07 | Visitor asking for personal data gets a sign-in challenge, no data | ✅ Pass | ✅ Pass |
| A08 | Prompt-injection attempt does not leak system prompt or tool names | ❌ Fail | ✅ Pass |
| A09 | Visitor Mitra replies in Hindi to a Hindi question | ✅ Pass | ✅ Pass |
| A10 | Visitor Mitra avoids competitor claims and return guarantees | ✅ Pass | ✅ Pass |
| A11 | Savings application via UI is queued for officer review | ✅ Pass | ✅ Pass |
| A12 | Application with an existing customer's mobile is rejected (409) | ✅ Pass | ✅ Pass |
| A13 | Application requesting an existing staff username is rejected | ❌ Fail | ✅ Pass |
| A14 | Credit-card application returns a soft approval with a limit | ✅ Pass | ✅ Pass |
| A15 | Loan application returns in-principle sanction with EMI | ✅ Pass | ✅ Pass |
| A16 | Invalid applications are rejected (bad name/phone → 422, unknown product → 404) | ✅ Pass | ✅ Pass |
| A17 | Money is shown in Indian digit grouping (₹2,70,000 not ₹270,000) | ❌ Fail | ✅ Pass |
| A09b | Hindi reply writes the brand as कोष, as in the logo (never कोश / कोशी) | ✅ Pass | ✅ Pass |
| A16b | No application is accepted with a missing identity, PAN (cards/loans) or bad PIN — nothing is invented (new check) | — | ✅ Pass |

**B. Customer journeys**

| ID | Check | Pass 1 | Pass 2 |
|---|---|---|---|
| B01 | Customer signs in with Firebase phone OTP through the Kosh identity service | ✅ Pass | ✅ Pass |
| B02 | First sign-in asks for digital-banking consent and records it | ✅ Pass | ✅ Pass |
| B03 | All 14 customer pages render without errors | ✅ Pass | ✅ Pass |
| B04 | Mitra retrieves accounts and recent spending with read-only tools | ✅ Pass | ✅ Pass |
| B05 | Mitra replies never show raw 'SUGGESTIONS:' markup | ❌ Fail | ✅ Pass |
| B06 | Before KYC, transfers are refused with a KYC explanation (no challenge issued) | ✅ Pass | ✅ Pass |
| B07 | KYC form accepts two document uploads and moves to review without a reload | ❌ Fail | ✅ Pass |
| B08 | Google Cloud OCR reads PAN and passport and prefills details | ✅ Pass | ✅ Pass |
| B09 | Fresh Firebase step-up (L3) succeeds on the first attempt | ❌ Fail | ✅ Pass |
| B10 | KYC application is submitted and appears in My requests | ✅ Pass | ✅ Pass |
| B11 | Account statement downloads as CSV | ✅ Pass | ✅ Pass |
| B12 | Mitra freezes the debit card on request (protective, low friction) | ✅ Pass | ✅ Pass |
| B13 | Withdrawing consent blocks banking actions; granting it again restores them | ✅ Pass | ✅ Pass |
| B14 | Logout ends the Kosh session (old cookie no longer works) | ✅ Pass | ✅ Pass |
| B15 | Opening Kosh in a second tab does not break actions in the first tab | ❌ Fail | ✅ Pass |

**C. Bank officer journeys**

| ID | Check | Pass 1 | Pass 2 |
|---|---|---|---|
| C01 | Officer signs in with username and password | ✅ Pass | ✅ Pass |
| C02 | Officer pages (queue, leads, history, audit) render | ✅ Pass | ✅ Pass |
| C03 | Officer approves the customer's KYC after verification (Review case → checks → Approve) | ✅ Pass | ✅ Pass |
| C04 | Officer approves the savings application and credentials are emailed | ✅ Pass | ✅ Pass |
| C05 | Credentials email is Kosh-branded and links to the Kosh sign-in | ❌ Fail | ✅ Pass |
| C06 | New customer signs in with the emailed username and temporary password | ✅ Pass | ✅ Pass |
| C07 | Officer can re-issue credentials (new email sent) | ✅ Pass | ✅ Pass |
| C08 | Re-issue API does not return the temporary password to the browser | ❌ Fail | ✅ Pass |
| C09 | After re-issue, the old password stops working and the new one works | ✅ Pass | ✅ Pass |
| C10 | Officer wipes a customer; their login stops working | ✅ Pass | ✅ Pass |

**D. Security**

| ID | Check | Pass 1 | Pass 2 |
|---|---|---|---|
| D01 | Protected APIs reject anonymous callers (401) | ✅ Pass | ✅ Pass |
| D02 | State-changing calls without the CSRF header are rejected (403) | ✅ Pass | ✅ Pass |
| D03 | A customer cannot call officer APIs (403) | ✅ Pass | ✅ Pass |
| D04 | Payment challenge cannot be approved without a fresh Firebase verification | ✅ Pass | ✅ Pass |
| D05 | The public demo code 246810 cannot raise a session to L3 (Firebase is the only step-up) | ❌ Fail | ✅ Pass |
| D06 | Session cookie is HttpOnly and SameSite | ✅ Pass | ✅ Pass |
| D07 | Auth-server internal endpoints (provision/wipe user) reject unauthenticated callers | ❌ Fail | ✅ Pass |
| D08 | Logout is not triggerable by a cross-site GET (POST only) | ❌ Fail | ✅ Pass |
| D09 | Customer passwords are stored with a slow salted hash (not SHA-256 + fixed salt) | ❌ Fail | ✅ Pass |
| D10 | Public config does not advertise an OTP / test code to non-local visitors | ❌ Fail | ✅ Pass |
| D11 | Security headers (CSP, X-Frame-Options, nosniff, Referrer-Policy) are set | ✅ Pass | ✅ Pass |
| D12 | CORS does not allow arbitrary origins | ✅ Pass | ✅ Pass |
| D13 | Sign-in screen's idle-timeout promise matches the server setting | ❌ Fail | ✅ Pass |
| D14 | Public application cannot hijack an existing staff login | ❌ Fail | ✅ Pass |
| D05b | Demo-code L3 cannot be used to approve a ₹90,000 transfer | ❌ Fail | ✅ n/a — the demo code no longer grants L3 (D05) |
| D07b | Even with the service token, provisioning cannot overwrite another user's login (new check) | — | ✅ Pass |

**E. Brand (Kosh) & model (Gemini 3.8 Flash)**

| ID | Check | Pass 1 | Pass 2 |
|---|---|---|---|
| E01 | No user-facing text calls the product 'Sentinel' (Sentinel only for fraud/risk) | ❌ Fail | ✅ Pass |
| E02 | 'Kavach' is used only for the approval dialog, not for fraud decisions | ❌ Fail | ✅ Pass |
| E03 | Brand is fixed at the source (no runtime Sentinel→Kosh text rewriting in the browser) | ❌ Fail | ✅ Pass |
| E04 | Configured model is gemini-3.8-flash everywhere (no 2.5 references) | ❌ Fail | ✅ Pass |
| E05 | Mitra actually runs on gemini-3.8-flash at runtime | ❌ Fail | ✅ Pass |

**P. Payments & Sentinel risk decisions**

| ID | Check | Pass 1 | Pass 2 |
|---|---|---|---|
| P01 | After officer approval, the customer's KYC shows as verified and transfers unlock | ✅ Pass | ✅ Pass |
| P02 | Known Tata Power bill (₹2,430) is paid autonomously — Sentinel ALLOW | ✅ Pass | ✅ Pass |
| P03 | Repeating the bill payment does not charge twice | ✅ Pass | ✅ Pass |
| P04 | ₹75,000 to a new beneficiary triggers a Sentinel CHALLENGE and an approval card | ❌ Fail | ✅ Pass |
| P05 | Customer approves in the Kavach dialog with fresh Firebase verification; transfer executes once | ❌ Fail | ✅ Pass |
| P06 | Payment to a known mule (Fast Cash Services) is DENIED by Sentinel with no debit | ✅ Pass | ✅ Pass |
| P07 | Transactions page shows the new bill payment and transfer | ✅ Pass | ✅ Pass |
| P08 | Several payment attempts within 10 minutes escalate a high-value new-payee transfer (Sentinel VELOCITY_LIMIT → DENY) (new check) | — | ✅ Pass |

**R. Account opening with RPA into core banking**

| ID | Check | Pass 1 | Pass 2 |
|---|---|---|---|
| R00 | Account-opening form accepts a mobile typed as +91 98765 43210 | ❌ Fail | ✅ Pass |
| R01 | Customer submits a savings-account opening application (with document) in the Mitra workflow | ✅ Pass | ✅ Pass |
| R02 | Officer approval dispatches the RPA job | ✅ Pass | ✅ Pass |
| R03 | RPA completes AO-001…AO-010 in the CBS maker screen and returns CIF + account number | ❌ Fail | ✅ Pass |

**Pass 1:** 74 checks — 47 passed, 27 failed.

**Pass 2:** 76 checks — 76 passed, 0 failed (3 new checks added while fixing: A16b, D07b, P08).

**Notes on how the passes were run.**
- **Pass 1 harness fixes (no product change):** during pass 1 I fixed a few harness mistakes before the recorded run, then re-ran everything on the unchanged code:
  - a stale CSRF token held by the test's API helper
  - a too-short request key
  - the officer screens' button labels
  - a wrong workflow ID in the consent check (B13, re-verified on the pass-1 code)
- **Pass 2, stage split:** pass 2 ran end to end on fresh databases. The ₹75,000 approval scenario (P04–P07) waits for Sentinel's 10-minute velocity window. During that wait the customer was correctly signed out by Kosh's 10-minute idle timeout, so those four checks ran in a follow-up stage that signs in again after waiting. The harness now always does this.

## 4. Defects found and fixed

Severity reflects impact on customers or the bank. Each fix was verified by the pass-2 check shown.

### Critical

| # | Defect | Cause | Fix | Verified by |
|---|---|---|---|---|
| 1 | **A public applicant could take over the officer's login.** An application asking for username `officer.mumbai`, once approved, reset the officer's password to the emailed temporary one and gave the applicant **OFFICER** access. | Approval reused any requested username, silently ignored the "already exists" error, and the identity server overwrote whichever user had that username. | Applications with a taken username are rejected (409). Approval only issues unused usernames and fails loudly. The identity server refuses to change a sign-in that belongs to another customer. | A13, D14, D07b |
| 2 | **The public code `246810` gave any customer L3 assurance**, which was enough to approve payments. Pass 1 executed a ₹90,000 transfer this way. | A leftover demo step-up route accepted a fixed code with no attempt limit, and the code was published in two public configs. | Route removed. Firebase re-authentication is the only step-up. The code is no longer published (see #17). | D05 (D05b proved the attack in pass 1) |
| 3 | **Anyone could create, change or delete sign-ins on the identity server** (`/api/internal/provision-user`, `wipe-user`, listening on all interfaces). | No authentication on the internal endpoints. | Shared service token (`AUTH_INTERNAL_TOKEN`), compared in constant time and required in production. Kosh sends it. | D07 |

### High

| # | Defect | Cause | Fix | Verified by |
|---|---|---|---|---|
| 4 | Every Firebase step-up returned **HTTP 500**, so KYC submission, payment approval and adding a payee were broken. | The rate limiter needs a `response` parameter that the new route lacked. | Parameter added. | B09 |
| 5 | **Mitra revealed its system prompt and internal tool names** when asked to "ignore all previous instructions". | The injection guard was an exact keyword list, and nothing checked the output. | Phrasing-tolerant injection guard (English, Hinglish, Hindi, Marathi) on both chat paths, plus an output filter that replaces any reply exposing prompts or tool names. | A08 |
| 6 | **Approved account openings never reached core banking.** The RPA job stayed `PENDING` forever. | The RPA worker start was dropped from app start-up. | Worker restored. The run completes AO-001…AO-010 and returns CIF and account number. | R02, R03 |
| 7 | **The KYC form broke after a document upload** ("This form has changed. Reload it"). A customer couldn't attach PAN and address proof in one go. | Mitra's background prefill bumped the draft revision while the form kept the old one. | Saves always use the latest draft and send only the fields the customer edited, so Mitra's prefill is merged, not overwritten. | B07 |
| 8 | A second document's AI prefill was **silently dropped** if Mitra was still reading the first. Revealed once #7 was fixed. | The chat refuses a new prompt during a running turn, and the form ignored that. | The form waits until Mitra is free, then sends the prefill. | B07, B08 |
| 9 | **Freezing a card made a genuine transfer look risky.** A customer who froze a lost card and then paid someone was pushed from CHALLENGE to DENY. | Sentinel's velocity rule counted every action, including card freezes, as a payment attempt. | Only bill payments and transfers count toward velocity. | P04 |
| 10 | Kosh stored customer passwords as **SHA-256 with a fixed salt**. | Legacy code, even though the identity server (Better Auth) already owns and checks credentials. | Kosh stores no password hashes at all. | D09 |
| 11 | The officer's "re-issue credentials" API **returned the temporary password** to the browser. | Password included in the response. | Removed. The password goes only in the email. | C08 |

### Medium

| # | Defect | Fix | Verified by |
|---|---|---|---|
| 12 | Raw `SUGGESTIONS: ["…"]` markup showed at the end of Mitra's replies (visitor and customer). | The server extracts it into suggestion chips and cleans streamed text; the UI also never renders the marker. | A06, B05 |
| 13 | Opening Kosh in a **second tab silently broke the first** (403 CSRF on the next action, no message). | The API client refreshes the CSRF token and retries once. | B15 |
| 14 | The account-opening form **masked a mobile typed as +91 98765 43210** (`+XXXX XXXX 3210`), then failed its own check. | Mobile numbers are normalised to 10 digits before validation. | R00 |
| 15 | Money shown in Western grouping (**₹270,000** instead of ₹2,70,000) in applications, officer notes and chat. | The shared `inr()` formatter is back everywhere. | A14, A15, A17 |
| 16 | Applications **invented an applicant** when fields were missing (name "Vikram Singhania", random phone), and PAN/PIN checks for cards and loans were gone. | Name, mobile, PAN (cards and loans) and PIN are validated again; nothing is made up. | A16, A16b |
| 17 | The Firebase test OTP was published to every visitor in the public config. | Only returned on a local (loopback), non-production host, where the local test number needs it. | D10 |
| 18 | A cross-site `GET` could log a customer out. | GET logout removed (the app uses POST). | D08 |
| 19 | **Brand:** 29 user-facing "Sentinel" product mentions; fraud decisions labelled "Kavach" ("Kavach blocked this action"); credentials email sent as "Sentinel Digital Banking Operations"; a runtime rewrite script masking all of this. | See section 5. | A04, C05, E01–E03 |
| 20 | **Model** was `gemini-2.5-flash`. | `gemini-3.8-flash` on the `global` endpoint. | A05, E04, E05 |
| 21 | Demo customer Sudhir (CUST-1002) could pass Firebase but was then rejected by Kosh ("no active profile"). | Kosh demo profile restored to match the identity server and seed. | unit tests |

### Low

| # | Defect | Fix | Verified by |
|---|---|---|---|
| 22 | The step-up dialog's title and code label were nearly invisible (light text on white). | Explicit colours; Tailwind's layered utilities were losing to the app CSS. | visual (screenshots) |
| 23 | Sign-in screen promised "session ends after **5** minutes idle"; the server uses **10**. | Copy aligned (English, Hindi, Marathi). | D13 |
| 24 | Hindi replies sometimes called the bank "कोशी" / "कोश"; the logo says **कोष**. | Explicit naming rule in Mitra's instructions. | A09b |
| 25 | Smaller regressions: re-issue sent the *masked* phone to the identity server; the local step-up never pre-filled (`is_local` missing); the chat ignored the website language; the companion cross-sell card was dropped. | All restored. | B09, C07, A09 |
| 27 | *(Policy change, your decision)* Attempts blocked only for incomplete KYC counted toward Sentinel's velocity rule, turning a legitimate post-KYC transfer into a denial. | Such attempts are excluded from the count; genuine repeats still count. | P08, P04, unit tests |
| 26 | Async tests couldn't run: `pytest` and `pytest-asyncio` were missing from `requirements-dev.txt`. | Added (plus `pytest-timeout`). | Python suites |

The 36 failing Python tests in pass 1 were mostly **stale tests** for removed login and OTP routes. They were rewritten for the current design (Firebase step-up, officer-approved onboarding), not weakened. Two tests for routes that no longer exist were removed (password change, OTP lockout). Their protections are covered by new route-level tests.

## 5. Brand and model changes

**Naming rule applied:** *Kosh* is the product and bank; *Mitra* is the AI banker; *Sentinel* is the fraud and risk engine (checks, holds, denials, risk reasons); *Kavach* is the trusted payment-approval dialog.

- **Renamed to Kosh:** the README title and description, sign-in and OAuth error messages, audit summaries, backend and module descriptions, the credentials email sender name, and CSS/comment labels.
- **Changed from Kavach to Sentinel (fraud checking):** "Sentinel checks every payment", "Sentinel guards every rupee", "Sentinel blocked this action", "Reason from Sentinel", "Sentinel is on / watching out for you", "Sentinel security" (sidebar), "Sentinel holds payments that look unusual…", the marketing story, and the demo card text. In Hindi and Marathi: **सेंटिनल**.
- **Kept as Kavach (approval dialog):** "Kavach approval dialog", "Kavach verified and completed your payment", "Kavach authorization".
- **Mitra's instructions** now state the names, including the Devanagari spelling **कोष**, and forbid revealing its instructions.
- **Deliberately unchanged technical names** (agreed before testing, because renaming them breaks the deployed Cloud Run service, the Cloud SQL database and the registered OAuth clients): `SENTINEL_*` env vars, the `sentinel_session` cookie, database names, the `sentinel-web` / `sentinel-chat` OAuth client IDs, token claim URIs, the `sentinel.py` module, and the deployed service URL.
- **Model:** `backend/settings.py` → `DEFAULT_MODEL = "gemini-3.8-flash"`, default location `global`. `.env` → `GOOGLE_CLOUD_LOCATION="global"`. `.env.example`, the README and tests were updated. No 2.5 references remain.

## 6. Open items and recommendations (not changed)

1. **Sentinel velocity policy: resolved (your decision).** Payment attempts refused only because KYC was incomplete no longer count toward the 10-minute velocity rule. Genuine repeated attempts still do. Unit tests cover both sides, and the first one fails on the old code. In the final retest, check P08 confirms the post-KYC ₹75,000 transfer gets a normal approval challenge (reason codes had no `VELOCITY_LIMIT`), and 76/76 checks passed with no 10-minute wait.
2. **Deployed Cloud Run is still on the old code and config.** Before redeploying:
   - set `GOOGLE_CLOUD_LOCATION=global`
   - set a strong `AUTH_INTERNAL_TOKEN` on both Kosh and the auth-server
   - rebuild both images
   - re-run `bootstrap-clients` if the OAuth redirect URLs change
3. **Secrets hygiene:** `.env` holds the Cloud SQL password (for a database on a **public IP**) and a Gmail app password in plain text. Credentials emails are sent from a personal Gmail address. Move these to Secret Manager and use a bank-owned sender.
4. **LLM variability:** Hindi brand spelling and refusal wording depend on the model following instructions. Pass 2 passed, but these checks can vary between runs.
5. **Not covered by this pass:**
   - mobile and tablet layouts
   - a formal accessibility audit
   - load and performance
   - real SMS to non-test numbers
   - voice input and UPI QR camera scanning
   - the deployed Cloud Run and Cloud SQL environment
6. **Earlier over-engineering audit** findings were not applied; that's separate work.
7. `sentinel_laxman/` (the stale full copy) was left untouched.

## 7. What changed on your machine

- **Local git repository** initialised with a baseline commit (nothing pushed; no remote):
  - `50403c6` baseline
  - `5e22f27` test harness
  - `9a453d3` fixes
  - `362e4d5` prefill-queue fix
  - `e0f068c` harness timing
  - this report and the final harness step
  - `d954872` velocity policy change
- **`.env`:** only `SMTP_FROM_NAME` (now "Kosh Digital Banking Operations") and `GOOGLE_CLOUD_LOCATION` (now `global`) changed.
- **Installed locally:**
  - `venv/` (Python deps plus pytest, pytest-asyncio, pytest-timeout, aiosmtpd, websockets)
  - `frontend/node_modules`, `auth-server/node_modules`
  - Playwright Chromium in `~/Library/Caches/ms-playwright`
  - `.local/`, which is gitignored: portable Postgres, test stack script, mail catcher, test results, database backups
- The other project (`../sentinel` on ports 8017 and 8018) was left running and untouched. This stack uses 8019 (app), 8020 (auth), 5434 (Postgres) and 1025 (mail catcher).

## 8. How to run it again

```bash
.local/stack.sh start                      # Postgres + auth-server + Kosh on http://127.0.0.1:8019 (fresh DB: rm .local/e2e.sqlite3)
venv/bin/python tests/e2e/kosh_e2e.py --out .local/e2e-results/run3     # full end-to-end pass (~50 min)
venv/bin/python tests/e2e/report_table.py .local/e2e-results/run1-final/results.json .local/e2e-results/run3/results.json
.local/stack.sh stop
```

Python suites, one file at a time, isolated from real data:
`SENTINEL_DATABASE_URL=sqlite+pysqlite:////tmp/kosh-unit.sqlite3 SMTP_HOST= BETTER_AUTH_URL=http://127.0.0.1:9 venv/bin/python -m pytest -q <file>`

## 9. Follow-up changes after the report

### 9.1 Mitra conversation fix (from your chat transcript)

**What was wrong:**
- The companion "Pre-Approved Card" appeared on every reply.
- Mitra invented a video-KYC, SMS-link and appointment process that Kosh doesn't have.
- It created three anonymous "leads" with no contact details, and never submitted the real application.

**Now:**
- **Mitra takes the application in chat.** It uses the details already typed, shows a summary, and submits only after the visitor's own "confirm" (detected in code).
- **One application per product.** It goes through the same path as the website form and shows an "Application submitted" card with the real reference.
- **Only the real process:** officer review → credentials by email → sign in → KYC with Mitra.
- **Cross-selling:** one relevant companion offer per chat; never shown again after "no thanks"; an accepted offer goes through the same confirm-and-submit flow.
- **Other fixes:**
  - The sales filter compares rates by value (2% = 2.0%).
  - The fallback reply moves the journey forward.
  - Startup no longer crashes when a real profile owns a demo mobile.

Verified by end-to-end stage V (7/7, through officer approval, the emailed credentials and the customer's sign-in) and 6 unit tests.

### 9.2 Voice: Gemini text-to-speech

- **Listen** now reads Mitra's replies with **Gemini TTS** (`gemini-2.5-flash-tts`, voice "Kore"): the same natural voice on every device, including Hindi and Marathi. Gemini 3.8 Flash can't produce audio and there's no 3.8 TTS model yet, so this is the one deliberate exception to the 3.8 rule. It's configurable via `GEMINI_TTS_MODEL` / `GEMINI_TTS_VOICE`.
- **Speed:** replies are spoken in sentence-sized pieces, with the next piece prefetched, so the first audio arrives in ~5–9 s instead of ~70 s for a long reply. A device-voice fallback covers outages.
- **Voice input:** the restored `/api/chat/transcribe` (Gemini 3.8 Flash) makes it work again on browsers without live speech recognition.
- **Playback blocker fixed:** the page's security policy blocked audio playback entirely (`media-src` was missing). It now allows same-origin `blob:` media only.
- **Verified:**
  - an English, Hindi and Marathi round trip (TTS → transcription matches the text)
  - browser check A18 (audio playing, 8.6 s to first sound)
  - 4 route tests
- **Next step if needed:** Gemini's streaming audio API would cut time-to-first-sound further.

**Totals after these changes:** 142 Python tests pass; the full end-to-end run (with stage V) was 82/83. The one flag was the TTS model name, now an explicit exception in check E04. Stage A reran at 20/20 with voice.
