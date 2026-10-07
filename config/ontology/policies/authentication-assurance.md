---
id: pol.authentication_assurance
type: policy
name: Authentication Assurance
version: 0.1.0
status: draft
owner: security
---
# Authentication Assurance

Each action needs a minimum assurance level. If the session is below it, run `authenticate_step_up` before acting.

## Levels
| Level | Meaning | Typical method |
|---|---|---|
| L1 | Logged-in session | Password or federated login |
| L2 | Step-up | One-time code or device-bound confirmation |
| L3 | Strong | Biometric or device-bound key with liveness, or equivalent |

Map these to the values actually stored in `auth_sessions.assurance_level`. The mapping is a configuration item, not something to guess.

## Required level by action
| Action | Minimum level |
|---|---|
| View balances and transactions | L1 |
| Download statements | L1 |
| Add or edit a payee | L2 |
| Make a payment | L2 (L3 above the bank's high-value threshold) |
| Raise a transaction or card limit | L2 |
| Activate a card | L2 |
| Change phone, email or address | L3 |
| Close an account or exit a deposit early | L3 |
| Accept a loan sanction (e-sign) | L3 |
| Set a premium mandate or standing instruction | L2 |
| Submit a data-subject request | L3 |

## Rules
1. The **customer** completes the challenge. The agent never sees, relays or stores OTP values.
2. A delegated agent cannot satisfy step-up on the customer's behalf.
3. After `PARAM_STEP_UP_MAX_FAILURES` failures, lock step-up for `PARAM_STEP_UP_LOCK_MINUTES` and stop the action.
4. Failed step-up soon after a contact change or on a new device is a possible account-takeover signal. Alert the fraud analyst.
5. Never lower a required level to reduce friction. Offer a different way to complete the challenge instead.
