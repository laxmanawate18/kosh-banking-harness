# Sentinel Secure Banking — Project Status & Progress Tracker

> **Last Updated**: 2026-09-12 17:05 UTC  
> **Status**: 🟢 Production-Ready & Deployed on Cloud Run  
> **Active GCP Project**: `project-3da8cb5f-328e-44d3-b7a`  
> **Live URL**: [https://sentinel-banking-275388304596.us-central1.run.app](https://sentinel-banking-275388304596.us-central1.run.app)  
> **Local Dev URL**: [http://127.0.0.1:8017](http://127.0.0.1:8017)

---

## 📊 Milestone Tracker

| # | Milestone | Status | Description |
|---|---|:---:|---|
| **M1** | **Core Banking Domain & DB** | ✅ Done | Integer paise accounting, multi-account hierarchy, cards, utility bills, beneficiaries, audit logs. |
| **M2** | **Customer Profile: Sudhir Jaiswal** | ✅ Done | Customer `CUST-1002`, `+919839774797`, ₹29,05,000.00 across 3 accounts, Visa Signature card, bills, transactions. |
| **M3** | **Dual Authentication System** | ✅ Done | Phone Number + OTP for retail customers, Staff username/password for bank officers. |
| **M4** | **GCP Identity Platform & Firebase** | ✅ Done | Initialized Identity Platform on `project-3da8cb5f-328e-44d3-b7a`, configured `smsRegionConfig`, test OTPs, API keys. |
| **M5** | **Cloud Run Deployment** | ✅ Done | Containerized with Docker, automated build via Cloud Build, deployed to `us-central1`, public IAM invoker enabled. |
| **M6** | **Isolated OAuth Authentication** | ✅ Done | Firebase phone verification and staff credentials are handled only by the Better Auth authority; Sentinel accepts OIDC sessions and scoped tokens. |
| **M7** | **Security Policies (CSP & PDP)** | ✅ Done | Strict CSP with Google CDN / Identity / reCAPTCHA whitelisting, Policy Decision Point (PDP) checks, transaction digests. |
| **M8** | **Full Automated Test Suite** | ✅ Done | 54/54 passing unit & integration tests covering banking, auth, security, and portal routes. |
| **M9** | **Multi-Tenant Chatbot Isolation** | ✅ Done | Strict tool context binding & dynamic customer prompt injection ensuring 100% data isolation for Sudhir (`CUST-1002`). |
| **M10** | **Periodic Re-KYC Skill & Workflow** | ✅ Done | Antigravity SDK Skill (`skills/kyc_compliance/SKILL.md`), Re-KYC Dashboard Banner, document validation, officer dossier `P1-17`. |
| **M11** | **Initial KYC Onboarding & Document Scanner** | ✅ Done | Initial KYC (`NOT_DONE`), outward transfer/card restrictions (RBI/PMLA), PAN OCR extraction (`AAAPM1001M`), address proof scan, liveness check, FATCA/PEP, officer approval workflow. |

---

## 🔐 Credentials & Access Matrix

### 1. Customer Phone Sign-In
- **Primary Account**: **Sudhir Jaiswal** (`CUST-1002`)
  - **Phone Number**: **`+919839774797`** (or `9839774797`)
  - **Verification OTP**: **`246810`**
  - **Total Balance**: **₹29,05,000.00**
  - **KYC Status**: **`PENDING_RE_KYC`** (Periodic Re-KYC Update Due)
- **Secondary Demo Account**: **Aarav Mehta** (`CUST-1001`)
  - **Phone Number**: **`+919876543210`**
  - **Verification OTP**: **`246810`**
  - **Total Balance**: **₹4,10,000.00**
  - **KYC Status**: **`NOT_DONE`** (Initial KYC Incomplete — Outward Transfers & Card Operations Restricted)

### 2. Bank Staff / Officer Sign-In
- **Username**: `officer.mumbai`
- **Password**: `Officer@2468`
- **Capabilities**: Case review queue, decision approvals, escalations, full audit event stream.

---

## 🏛️ System Architecture

```
[ Web Browser Client ]
        │
        ├── (1) HTTPS UI / REST API / WebSockets
        │       │
        │       ▼
        │   [ Google Cloud Run (sentinel-banking) ]
        │       ├── FastAPI Backend (dev_ui.py)
        │       ├── Sentinel PDP Security Engine (sentinel.py)
        │       ├── Banking Data & Tool Layer (banking_db.py, banking_tools.py)
        │       ├── Authentication & JWT Session Engine (auth_service.py)
        │       └── SQLite / PostgreSQL Persistence (persistence.py, /app/data/)
        │
        └── (2) Client-Side Phone Auth & reCAPTCHA
                │
                ▼
            [ Google Cloud Identity Platform / Firebase ]
                ├── API Key: ${GOOGLE_API_KEY}
                ├── Project: project-3da8cb5f-328e-44d3-b7a
                └── SMS Region: India (IN) & US (US)
```

---

## 📁 Key File Map

| Path | Purpose |
|---|---|
| `dev_ui.py` | FastAPI composition root, shared security middleware, dependencies, and server entry point. |
| `backend/` | API contracts, routers, conversation persistence, WebSocket runtimes, settings, and Antigravity policy. |
| `portal.py` | Retail customer portal & bank operations router (`/api/portal/*`). |
| `auth_service.py` | Phone OTP logic, Google ID Token verification, JWT cookie issuance, CSRF tokens. |
| `banking_db.py` | Banking business rules, accounts, transactions, bills, beneficiaries, audit log hash chain. |
| `data/banking_seed.json` | Base data seed containing customer profiles, accounts, cards, and starting balances. |
| `frontend/` | React single-page application for authentication, banking views, workflows, and agent chat. |
| `Dockerfile` | Production container definition for Google Cloud Run. |
| `PROJECT_STATUS.md` | This living tracking document. |
