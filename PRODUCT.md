# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary audience: hackathon and demo reviewers.** People judging or evaluating a secure agentic banking demo. They need to see, quickly, that an AI banker can be useful and still cannot move money on its own.
- **Product users inside the demo:** an Indian retail banking customer (signs in with phone OTP, uses Mitra and the banking pages), a bank officer (reviews service requests, care cases and account applications), and an AI administrator (approvals, kill switches, audit chain, cost and quality).
- The public site also serves visitors who are not signed in and talk to Mitra about products.

## Product Purpose

Kosh is a simulated Indian retail bank built to show secure agentic banking. Mitra, the AI banker, proposes actions; Sentinel, a deterministic policy and fraud engine, decides allow, challenge or deny; a mock ledger executes exactly once. Success is a reviewer believing that an AI agent can serve banking customers without being able to move money by itself.

## Positioning

The AI agent never completes a payment alone. Every money movement goes through a deterministic decision engine and a human approval step, and every action is written to a tamper-evident audit trail. Prompt, ontology and skill changes need an evaluation run and an administrator approval before they reach production.

## Operating Context

- All data is dummy INR data. Core banking, e-KYC and notifications are mocks; only the demo banking actions have real execution adapters.
- One React single-page app serves the public site, the customer app, the officer console and the admin panel by role. Sign-in is OIDC with a separate auth service.
- Officers and admins work through queues, approvals and audit records; customers work through balances, payments, cards and service requests, alone or with Mitra.

## Capabilities and Constraints

- Mitra answers in English, Hindi and Marathi, but the interface is **English only**, by decision: no Hindi or Marathi interface translations will be added.
- Money is integer paise. The audit log is hash-chained.
- Customer sign-in is phone OTP; staff and admin use username and password. A demo OTP mode exists: registered demo numbers sign in with a fixed code that the sign-in page shows. It stays on in the deployed demo, so reviewers can sign in as a customer without a real phone.

## Brand Commitments

- The product names **Kosh**, **Mitra**, **Sentinel** and **Kavach** stay.
- The interface must always say it is a demo and never claim to be a real bank (the "Product demo, not a real bank" notice and dummy data stay everywhere).
- Existing identity: the lotus mark and the Devanagari wordmark ("कोष") beside the Kosh name, and the tagline "Bharosa, har kadam."

## Evidence on Hand

- A working demo with seeded customers, an officer and an admin; documentation in `README.md`, `docs/AI_GOVERNANCE.md` and `docs/ONTOLOGY.md`; a test report in `KOSH_TEST_REPORT.md`.
- No real customers, testimonials, regulator approvals or production deployment figures exist. Future work must not invent them.

## Product Principles

1. Be honest that it is a demo; never imply real money, a real licence or real customers.
2. The AI proposes and people and rules decide. Interfaces must make that division visible wherever money or approvals are involved.
3. Safety controls must look and behave like safety controls: clear status, a reason recorded, no look of a casual preference.
4. Plain language for customers and staff; internal terms (ontology, tokens, hashes) stay behind a details view.
5. Every role gets a calm, consistent work surface: the same page structure, the same status language, no surprises.

## Accessibility & Inclusion

The standard is **WCAG 2.2 Level AA**, for every page and role. That means text contrast of at least 4.5:1 (3:1 for large text), everything usable by keyboard alone with a visible focus indicator, labelled controls and status messages announced to screen readers, content that still works at 200% zoom, and touch targets large enough to hit. Safety-critical controls such as the kill switches must have a keyboard path as well as a pointer one. Indian number formatting (₹1,25,000) is used for money.
