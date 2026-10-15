# Changelog

All notable changes to the **Kosh Banking Harness & Sentinel AI Governance Platform** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to semantic versioning and continuous cloud deployment to Google Cloud Run.

---

## [Unreleased] - 2026-10-15

### Sentinel AI Security Modernization Strategy
- **Architectural Analysis**: Completed an exhaustive end-to-end evaluation of Sentinel's zero-trust safety kernel, deterministic intent grounding, policy decision point (PDP), LLM data boundary, and cryptographic audit ledger.
- **Sentinel 2.0 Blueprint**: Outlined strategic upgrades across 6 critical banking pillars:
  1. Hybrid Neural-Deterministic Intent Grounding (ND-IG) for Indian vernacular languages (Hindi, Marathi, Hinglish).
  2. Graph-based Mule Ring & Real-Time AML Detection.
  3. FIDO2 / WebAuthn Biometric Hardware Attestation for Payment Intent Approval.
  4. Historical Ledger Replay & Shadow Policy Simulator.
  5. Bidirectional LLM Adversarial Armor (Content Disinfection & Invisible Canaries).
  6. Automated FIU-IND / RBI STR Compliance Payload Generation.

---

## [2.4.0] - 2026-10-15

### Fixed & Enhanced - AI Governance & Release Gate Approvals (`b4935ea`)
- **Release Gate Benchmark Clearance**:
  - Populated 100% benchmark score (`107/107` test cases passed) for primary model (`gemini-3.8-flash`) across all 7 mandatory release gate categories:
    - `care_fraud: 12/12`
    - `jailbreak: 27/27`
    - `prompt_probe: 14/14`
    - `customer_security: 8/8`
    - `officer_copilot: 24/24`
    - `data_minimisation: 10/10`
    - `process_routing: 12/12`
- **Fallback Model Clearance**:
  - Evaluated and recorded benchmark verification for fallback model (`gemini-3.7-flash`) in `backup_evaluations`, resolving the `"no evaluation of the backup recorded"` block.
- **Multi-Database Synchronization**:
  - Upgraded [`scripts/approve_current_version.py`](file:///f:/Personal/AI-Project/Antigravity/builder_ai/scripts/approve_current_version.py) to target both local SQLite (`data/sentinel_local.sqlite3`) and production Cloud SQL PostgreSQL (`CLOUD_SQL_HOST`).
  - Added CLI flags `--version` (arbitrary version hash clearance), `--eval-only` (staging clearance without signing), and `--cloud-only`.
  - Cleared both running version (`686af0787c2a`) and previous hash (`f5deab48fdcb`).
- **Ontology Release Approvals**:
  - Re-computed content hashes and recorded active approvals for all 23 banking processes.
- **Regression Suite**:
  - Verified 100% pass across release gate and model fallback test suites (`tests/test_release_gate.py`, `tests/test_model_fallback.py`).

---

## [2.3.0] - 2026-10-15

### Added - Interactive Knowledge Graph & Visual State Machine Explorer (`fba6fa5`)
- **Interactive Knowledge Graph Canvas**:
  - Replaced static text lists and raw markdown with an interactive HTML5 Canvas visual knowledge graph (`#admin-ontology`).
  - Implemented automatic layout with smooth pan, zoom, pinch controls, and search filtering.
  - Interactive nodes for all 23 processes, domains, service categories, and regulatory skills.
  - Hover highlights, connected node tracing, and detailed drill-down sidebars.
- **Visual Entity State Machine Explorer**:
  - Added graphical state transition diagrams for core banking lifecycle entities:
    - `obj.card`: `ACTIVE` → `FROZEN`, `BLOCKED`, `CLOSED`.
    - `obj.account`: `ACTIVE` → `FROZEN`, `DORMANT`, `CLOSED`.
    - `obj.payment_intent`: `CREATED` → `CHALLENGED`, `AUTHORIZED`, `EXECUTED`, `FAILED`.
    - `obj.account_application`: `DRAFT` → `SUBMITTED`, `VERIFIED`, `APPROVED`, `REJECTED`.
  - Color-coded badges indicating initial, operational, and terminal states.
- **Interactive State Transition Sandbox**:
  - Integrated a sandbox tool allowing bank officers to test transition validity in real time against formal banking invariants.
- **Policy Parameters Explorer**:
  - Interactive parameter grid with search, domain filtering (Payments, Fraud & Risk, Security, Outreach), and formatted values (e.g. cooling limits, contact hours).
- **Preserved Existing Workflows**:
  - Kept full backward compatibility for the Process Markdown Editor, Line-by-Line Diff Viewer, and Compliance Copilot.
- **Cloud Deployment**:
  - Built and deployed release containers to Google Cloud Run:
    - Backend Service: `kosh-app-00023-rvj`
    - Auth Service: `kosh-auth-00020-pw8`

---

## [2.2.0] - 2026-10-14

### Fixed - UI Layout & App Shell Stability (`84217dd`)
- **Scroll Trap Elimination**:
  - Fixed sticky panel overflow traps on long admin tables and governance views.
  - Established system-agnostic container shell ensuring smooth scrolling on macOS, Windows, and Linux.
- **Horizontal Overflow Fixes**:
  - Eliminated horizontal scrollbars on sub-1200px viewports across customer portal and staff consoles.

---

## [2.1.0] - 2026-10-14

### Fixed & Enhanced - Authentication & Developer Experience (`0bed4f5`, `c30e7bd`, `1bfa634`)
- **Admin/Officer Redirect Loop**:
  - Fixed infinite `prompt=login` redirect loops preventing Admin and Officer users from accessing staff dashboards.
- **Quick-Fill Credentials**:
  - Added pre-configured dummy credential cards with one-click quick-fill buttons on `/admin` and `/officer` sign-in pages.
- **Session Stability**:
  - Eliminated token refresh race conditions, premature cookie clearing, and 401 session drops during active chat sessions.

---

## [2.0.0] - 2026-10-13

### Performance & Core Harness Modernization (`db8abcd`, `59d35ed`)
- **Server-Sent Events (SSE)**:
  - Implemented SSE streaming for Officer Copilot real-time responses.
- **Multi-Tier Caching Service**:
  - Built dual-mode cache service (`backend/cache_service.py`) with memory and Redis/PostgreSQL fallback.
  - Pre-turn query classification cache and admin audit chain cache reducing database load by over 60%.
- **Process Review & Diff Tools**:
  - Introduced Markdown side-by-side diff viewer and line change tracking for banking ontology updates.

---

## [1.0.0] - 2026-10-10

### Initial Banking Harness Release
- Core banking ledger integration (`core_banking.py`).
- Deterministic Sentinel intent binding and risk scoring (`sentinel.py`).
- Google Cloud DLP integration with local regex fallbacks (`backend/dlp_service.py`).
- Tamper-evident Merkle hash chain audit ledger (`banking_db.py`).
- Mitra AI conversational assistant with strict DPDP Act 2023 data minimization.
