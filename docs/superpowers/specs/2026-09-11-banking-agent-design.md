# Design Specification: Antigravity AI Banking Agent

## 1. Overview
Transform the Antigravity Agent Studio into a full-featured, interactive **AI Banking Agent**. The agent is equipped with domain-specific banking tools, a persistent mock banking database, financial calculation engines, card controls, dispute workflows, and rich live trace inspection.

---

## 2. Architecture & Components

```
+-------------------------------------------------------------+
|                      Dev Studio Web UI                      |
| (Quick Banking Prompts | Chat Space | Live Trace Inspector) |
+------------------------------+------------------------------+
                               | WebSocket (/ws/chat)
+------------------------------v------------------------------+
|                    FastAPI Backend Server                   |
|  - Session Persistence & Trace Serialization                |
|  - Agent Config & Tool Dispatch Engine                      |
+------------------------------+------------------------------+
                               | Tool Invocations
+------------------------------v------------------------------+
|                  Banking Tool Suite Layer                   |
|  [Accounts] [Transactions] [Transfers] [Cards] [Loans] [FX] |
+------------------------------+------------------------------+
                               | Data Access
+------------------------------v------------------------------+
|               Mock Banking Ledger / Database                |
|  - Customers, Accounts, Cards, Loans, Fraud Watch, Payees   |
|  - In-memory state with JSON seed & ledger updates          |
+-------------------------------------------------------------+
```

---

## 3. Banking Data Store (`banking_db.py`)
A structured database initialized with realistic dummy customer profiles:
- **Default Customer**: `CUST-78901` (Sarah Jenkins, Premier Tier, Credit Score: 785)
- **Accounts**:
  - `ACC-CHK-101`: Premier Checking ($14,850.25)
  - `ACC-SAV-202`: High-Yield Savings ($48,200.00, 4.5% APY)
  - `ACC-INV-303`: Wealth Growth Investment ($125,400.00)
  - `ACC-CC-404`: Platinum Rewards Credit Card (Balance: $1,420.50, Limit: $15,000.00)
- **Cards**:
  - `CARD-DEBIT-5521`: Linked to `ACC-CHK-101` (Active, Daily Limit: $2,500)
  - `CARD-CREDIT-8842`: Linked to `ACC-CC-404` (Active, Limit: $15,000)
- **Recent Transactions & Ledger**: Historical records across categories (`groceries`, `travel`, `utilities`, `dining`, `payroll`) with `COMPLETED`, `PENDING`, and `FLAGGED_FRAUD` statuses.
- **Loans**:
  - `LOAN-AUTO-501`: 48-Month Auto Loan ($18,500 remaining @ 5.2% APR)
  - `LOAN-MORT-601`: 30-Year Fixed Mortgage ($380,000 remaining @ 6.1% APR)

---

## 4. Banking Tool Suite (`banking_tools.py`)

1. `get_customer_profile(customer_id: str)`: Returns customer details, tier status, credit score, and linked accounts.
2. `get_account_balances(customer_id: str, account_id: Optional[str])`: Returns balance summaries, available vs posted funds, and APY rates.
3. `get_transaction_history(account_id: str, limit: int = 10, category: Optional[str] = None)`: Searches and filters transaction history.
4. `transfer_funds(from_account_id: str, to_account_id: str, amount: float, description: str)`: Validates funds, executes transfer, updates ledger, and outputs confirmation receipt.
5. `pay_bill(customer_id: str, from_account_id: str, payee_name: str, amount: float)`: Processes recurring/one-off bill payments.
6. `manage_card_status(card_id: str, action: str, reason: Optional[str])`: Manages card status (`FREEZE`, `UNFREEZE`, `REPORT_LOST`, `SET_LIMIT`, `REPLACE`).
7. `calculate_loan_estimate(principal: float, annual_rate_pct: float, term_months: int)`: Calculates monthly EMI payment, total interest, and amortization breakdown.
8. `inspect_fraud_alerts(customer_id: str)`: Retrieves transactions flagged by automated fraud monitoring.
9. `dispute_transaction(transaction_id: str, reason: str, comments: str)`: Files transaction dispute, creates claim case, and issues provisional credit.
10. `get_fx_exchange_rate(from_currency: str, to_currency: str, amount: float = 1.0)`: Calculates currency conversions (USD, EUR, GBP, JPY, CAD, INR, AUD, CHF).

---

## 5. Dev Studio UI Updates
- Update welcome screen with specialized banking quick prompts.
- Custom system prompt setting the agent as a financial banking specialist with security and verification protocols.
- Real-time trace visibility of tool calls, inputs, outputs, and financial calculations.

---

## 6. Verification Plan
- Unit tests covering all 10 banking tools and ledger updates (`test_banking_tools.py`).
- Integration tests verifying WebSocket streaming and tool execution inside `test_dev_ui.py`.
- Interactive browser verification via Dev Studio on `http://localhost:8000`.
