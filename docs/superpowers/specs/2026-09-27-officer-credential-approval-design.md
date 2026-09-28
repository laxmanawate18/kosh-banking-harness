# Officer Credential Approval & Email Delivery Design

## Overview
Currently, when a visitor (non-customer) applies for a banking product (such as a Savings/Deposit account), Sentinel auto-provisions a simulated account profile and displays it immediately in the client UI.

Under this new architecture:
1. When any applicant without an existing banking relationship applies for ANY product (Credit Card, Loan, or Savings Account), the system records an application with status `PENDING_APPROVAL`.
2. The applicant receives a confirmation that their application has been received and queued for review. **No credentials, account numbers, or login shortcuts are shown to the applicant.**
3. A Bank Officer reviews the pending application in the **Operations Dashboard** (`#operations`) under the **AI Sales Leads / Onboarding** pipeline.
4. The Bank Officer clicks **"Approve & Dispatch Credentials"**.
5. The backend generates a unique username and a cryptographically secure temporary password, provisions the core banking customer profile and product account, and sends an official Sentinel welcome email with login credentials via standard SMTP (or logs in audit trail if SMTP is unconfigured).
6. The lead status transitions to `APPROVED_PROVISIONED` (or `CONVERTED`), preventing duplicate provisioning.

---

## 1. Application Submission Flow (Visitor Side)

### 1.1 Endpoint Changes: `POST /api/products/apply`
* **Applicant Email Required**: The application form validates and requires an email address.
* **Relationship Check**:
  * Check `phone_number` and `email` against `db.customers` and `auth_service`.
  * If an existing active customer profile exists, link to the existing customer and flag as an existing-customer cross-sell.
  * If **no existing customer profile exists**:
    * Create a lead record in `db.leads` with status `PENDING_APPROVAL`.
    * Store applicant metadata in `preferences`: `applicant_name`, `phone_number`, `email`, `pan_masked`, `pincode`, `product_id`, `employment_type`, `monthly_income_minor`, and `delivery_status: "PENDING"`.
* **Visitor UI (`InstantOnboardingModal.tsx`)**:
  * Instead of displaying account numbers or login buttons, display a clean confirmation card:
    * Status: **Application Under Officer Review**
    * Message: *"Your application for [Product Title] has been submitted. For your security, our banking operations team will review your application. Upon approval, your Sentinel digital banking credentials will be dispatched to [user@example.com]."*
    * CTA: **"Done · Return to Sentinel Banking"**

---

## 2. Bank Officer Approval & Delivery Flow

### 2.1 Backend Route: `POST /api/officer/leads/{lead_id}/approve`
* **Authentication**: Requires authenticated bank officer session (`require_officer`).
* **Protection**:
  * Validates that lead exists and status is `PENDING_APPROVAL` (or `QUALIFIED` / `INTERESTED` without existing provisioned profile).
  * Validates that applicant has a valid email address.
  * Idempotency: Prevents double-approvals if `customer_id` is already assigned.
* **Execution**:
  1. Generate unique username (e.g. `vikram482a`).
  2. Generate 14-char secure temporary password using `secrets.choice`.
  3. Call `db.onboard_customer_with_product(...)` to create `customer_id`, customer record, primary account, and cards.
  4. Call `auth_service.create_onboarded_profile(...)` with the generated username and hashed password.
  5. Dispatch email via `backend/email_service.py`.
  6. Update lead status to `CONVERTED` and set `customer_id`, `delivery_status = "SENT"`, and `approved_by = officer.username`.
  7. Append audit event `CREDENTIALS_PROVISIONED_BY_OFFICER`.

### 2.2 Rejection Route: `POST /api/officer/leads/{lead_id}/status`
* Allows officer to decline with notes, setting status to `DECLINED` or `LOST`.

---

## 3. Transactional Email Service (`backend/email_service.py`)

### 3.1 Configuration
Supports standard SMTP configuration via environment variables:
* `SMTP_HOST`: Hostname of SMTP server (e.g., `smtp.gmail.com`, `smtp.sendgrid.net`, `email-smtp.us-central1.amazonaws.com`).
* `SMTP_PORT`: Port (default `587`).
* `SMTP_USER`: SMTP username / API key user.
* `SMTP_PASSWORD`: SMTP password / API secret.
* `SMTP_USE_TLS`: Enable STARTTLS (default `True`).
* `SMTP_FROM_EMAIL`: Sender address (default `no-reply@sentinelbanking.com`).
* `SMTP_FROM_NAME`: Sender display name (default `Sentinel Digital Banking`).
* `SENTINEL_PUBLIC_URL`: Base login URL for the email action button (e.g., `https://sentinel-banking-275388304596.us-central1.run.app`).

### 3.2 Email Content
* **Subject**: `Welcome to Sentinel Banking - Your Digital Credentials for [Product Name]`
* **HTML & Plain Text**:
  * Formal banking greeting to applicant name.
  * Product approval confirmation.
  * Styled security credential container:
    * **Username**: `[username]`
    * **Temporary Password**: `[temporary_password]`
    * **Customer ID**: `[customer_id]`
  * Security requirement: Mandate password update upon initial sign-in.
  * Direct CTA button: **"Sign In to Sentinel Banking"** linking to `${SENTINEL_PUBLIC_URL}`.

### 3.3 Fallback Simulation
* If `SMTP_HOST` is not configured, the engine records the full email payload in `db.append_audit("EMAIL_CREDENTIALS_SIMULATED", ...)` and returns `delivery_status: "SIMULATED_LOGGED"`.
* This ensures flawless operation in development and test environments without failing outbound network calls.

---

## 4. Frontend Operations Dashboard UX (`OperationsPage.tsx`)

### 4.1 Lead Detail Modal
When an officer clicks on a lead:
* Prominent badge for `PENDING_APPROVAL` (amber).
* If `PENDING_APPROVAL`:
  * Action Bar shows:
    * **"Approve & Send Credentials via Email"** (Primary emerald button with email/sparkles icon).
    * **"Decline Application"** (Subtle red button).
  * Clicking "Approve & Send Credentials":
    * Shows loading state (*"Provisioning account & dispatching credentials..."*).
    * On success, shows a success toast/banner with Customer ID and confirmed delivery email.
    * Re-fetches leads list and refreshes stats.
* If already `CONVERTED`:
  * Shows assigned Customer ID and badge `"Credentials Dispatched to [email]"`.

---

## 5. Verification Plan

1. **Unit & API Tests**:
   * Add pytest test in `tests/test_officer_credential_approval.py`:
     * Visitor applies for product $\rightarrow$ lead created with `PENDING_APPROVAL`, no credentials returned.
     * Officer calls `/api/officer/leads/{lead_id}/approve` $\rightarrow$ verifies customer is created, temporary credentials generated, email service called (mocked SMTP), and lead marked `CONVERTED`.
     * Customer can authenticate with the newly issued credentials.
     * Non-officers cannot call the approve endpoint (403 forbidden).
2. **End-to-End Flow**:
   * Test with browser / dev UI:
     * Apply via `InstantOnboardingModal` with email `test.applicant@example.com`.
     * Verify modal displays "Under Officer Review" without credentials.
     * Log in as `officer.mumbai` $\rightarrow$ open `#operations`.
     * Inspect lead, click "Approve & Send Credentials".
     * Verify lead status changes and audit log records email dispatch.
