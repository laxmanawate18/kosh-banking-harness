# AI Digital Branch PRD implementation status

This build implements the secure product spine and exposes every PRD service through a governed catalogue. It does not pretend that a generic request row is equivalent to a production core-banking integration.

## Implemented end to end

- Customer and named-officer identities with Argon2 password verification.
- Opaque, hashed, revocable sessions in PostgreSQL; HttpOnly SameSite cookies; inactivity and absolute expiry.
- CSRF verification on every state-changing browser request.
- L2 sign-in plus rate-limited, five-minute L3 step-up assurance.
- Explicit, versioned, revocable purpose consent and scoped permissions.
- Owner-scoped conversation persistence and cookie-authenticated WebSockets.
- The deterministic Sentinel PDP: intent binding, delegation, ownership, anomaly scoring, injection provenance, stable reason codes, HMAC authorization, replay defense, and exactly-once execution.
- Autonomous known-bill payment, challenged P2P transfer, hard-denied poisoned proposal, and authorized protective card freeze.
- The complete P1/P2 service catalogue, auth-level metadata, customer request creation, durable status, human-approval routing, named officer decisions, mandatory reasons, and discrepancy override justification.
- A branch-appointment choice presented alongside the digital agent.
- PostgreSQL 16 Docker runtime, SQLAlchemy transaction/locking layer, JSONB banking aggregate, typed relational control tables, and Alembic migrations.
- Append-only application audit records with session, consent, model/prompt/policy, service, approval, and actor fields plus an HMAC hash chain.
- Fixed trusted UI renderers; no raw model HTML and no chain-of-thought exposure.

## Catalogue-backed workflow, not specialized execution

The 38 PRD services can be submitted and tracked. Human-approval services route to the officer queue. They deliberately do not change mock CBS data unless a specialized, Sentinel-gated executor exists. This prevents the UI from claiming a bank-side outcome that the prototype cannot prove.

Specialized executors currently exist for account/transaction retrieval, bill payment, P2P transfer, security alerts, and card freeze. Other services return durable `SUBMITTED`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `MORE_INFO_REQUIRED`, or `ESCALATED` states.

## Production integration seams

- Replace the JSONB banking aggregate adapter with CBS payment/card adapters while retaining Sentinel's evaluation and authorization-token contract.
- Connect a bank IdP/passkey provider to the existing assurance/session dependency boundary.
- Add DMS object storage, antivirus/CDR, OCR/extraction confidence, tamper checks, and document retention to `DocumentRecord`.
- Add CRM case creation and customer notification delivery behind service-request status transitions.
- Replace the demo HMAC secrets and OTP with KMS/HSM managed signing and bank-controlled authentication.
- Add sanctions/AML screening, device intelligence, behavioral risk, maker-checker entitlements, multilingual evaluation, observability, backups, HA, and regulatory evidence controls before any real deployment.

## Architectural decision

Antigravity remains the sole AI orchestration SDK. FastAPI coordinates deterministic application workflows; Sentinel and PostgreSQL are ordinary security/business systems, not secondary agents. The PRD's MCP/multi-agent suggestions were not adopted because they conflict with the project's explicit Antigravity-only and no-subagent constraint.
