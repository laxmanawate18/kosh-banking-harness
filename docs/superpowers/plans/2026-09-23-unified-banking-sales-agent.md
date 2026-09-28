# Unified Banking & Sales Agent with Secure Contextual Authentication Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the separate signed-out visitor sales agent and authenticated banking agent into a single, cohesive AI banker agent that provides full sales and product discovery capabilities to all users, while enforcing strict out-of-band authentication gating when unauthenticated visitors request personal banking actions.

**Architecture:** A single Antigravity `LocalAgentConfig` with combined public sales tools and banking tools. A unified `SentinelSecurityGateHook` dynamically permits public product tools for all sessions, but intercepts protected banking tools for unauthenticated sessions, returning a structured `AUTH_REQUIRED` challenge that renders a trusted native sign-in card in the chat interface.

**Tech Stack:** Python 3.11/3.14, FastAPI, Google Antigravity SDK (`LocalAgentConfig`, `hooks.PreToolCallDecideHook`), React 18, TypeScript, Firebase Phone Auth / Session Cookie Auth.

## Global Constraints
- **Zero Raw Credential Handling in LLM**: Passwords, OTPs, PINs, and session tokens MUST NEVER be requested, processed, or visible in the LLM chat thread or tool arguments.
- **Out-of-Band Auth Execution**: Authentication challenges must be fulfilled by the trusted browser modal (Phone OTP or Staff Login) and verified via secure HTTP-only cookies and CSRF tokens.
- **Tenant & Customer Data Isolation**: Banking tools remain strictly scoped to `context["customer_id"]`. If `customer_id` is missing/None, banking tools cannot be executed.
- **Backwards Compatibility**: All existing 99 backend tests and 4 frontend tests must continue to pass without regressions.

---

### Task 1: Unified Security Gate Hook & Combined Tools in Agent Config

**Files:**
- Modify: `backend/agent_config.py:70-235`
- Test: `test_banking.py` and `tests/test_visitor_chat.py`

**Interfaces:**
- Consumes: `build_banking_tools`, `build_public_sales_tools`, `PUBLIC_SALES_TOOL_NAMES`, `BANKING_TOOL_NAMES`
- Produces: `UnifiedSecurityGateHook`, `create_agent_config(session_id, ..., customer_id=None)`

- [ ] **Step 1: Write failing test for unified tool gating and unauthenticated banking tool rejection**

```python
# In test_unified_agent.py
def test_unauthenticated_session_denies_banking_tools_and_allows_sales():
    hook = UnifiedSecurityGateHook(context={}) # No customer_id
    # Should allow public sales tool
    res = asyncio.run(hook.run(None, types.ToolCall(name="search_public_products", args={"category": "SAVINGS"})))
    assert res.allow is True

    # Should deny protected banking tool with AUTH_REQUIRED message
    res_bank = asyncio.run(hook.run(None, types.ToolCall(name="get_customer_summary", args={})))
    assert res_bank.allow is False
    assert "AUTH_REQUIRED" in res_bank.message
```

- [ ] **Step 2: Run test to confirm it fails**
```bash
PYTHONPATH=. ./venv/bin/pytest tests/test_unified_agent.py
```

- [ ] **Step 3: Implement `UnifiedSecurityGateHook` in `backend/agent_config.py`**
Merge `PublicSalesToolGateHook` and `SecureToolGateHook` into `UnifiedSecurityGateHook`:
- If `name in PUBLIC_SALES_TOOL_NAMES`: validate public arguments; allow for both visitor and authenticated users.
- If `name in BANKING_TOOL_NAMES`:
  - If `not self.context.get("customer_id")`: return `HookResult(allow=False, message="AUTH_REQUIRED: You must be signed in to access personal banking details or execute transactions. Prompt the visitor to sign in using the bank's secure sign-in card.")`
  - If authenticated: enforce existing strict field checks, PII guards, and transfer rules.

- [ ] **Step 4: Update `create_agent_config` to combine tools and prompts**
- Combine `tools = build_public_sales_tools(sales_provider) + build_banking_tools(banking_provider)`.
- Combine system instruction:
  - Base persona: Sentinel AI Banker (covers both product advice & personal banking).
  - Include sales methodology (`DISCOVER`, `CLARIFY`, `RECOMMEND`, `EXPLAIN`).
  - Include personal banking rules, workflow skills, and explicit instruction: *"When an unauthenticated visitor asks for their balance, transfers, cards, or account details, explain that personal account access requires secure authentication and present the sign-in option."*
  - When authenticated, append the `Authenticated Customer Context` banner (`customer_name`, `customer_id`, `kyc_status`).

- [ ] **Step 5: Run tests and ensure all pass**
```bash
PYTHONPATH=. ./venv/bin/pytest tests/test_unified_agent.py tests/test_visitor_chat.py
```

- [ ] **Step 6: Commit changes**
```bash
git commit -m "feat(agent): unify agent tools and implement UnifiedSecurityGateHook with auth gating"
```

---

### Task 2: Backend WebSocket & Session Auth Escalation

**Files:**
- Modify: `backend/chat_runtime.py:80-220`
- Modify: `backend/session_routes.py`

**Interfaces:**
- Consumes: `serve_chat_websocket`, `AuthService`, `AuthContext`
- Produces: `AUTH_REQUIRED` presentation event payload to WebSocket client

- [ ] **Step 1: Write test for WebSocket auth challenge emission**
Test that when an unauthenticated session triggers an auth-gated tool rejection, the WebSocket emits an `auth_required` presentation payload with action metadata.

- [ ] **Step 2: Implement `auth_required` handler in `backend/chat_runtime.py`**
- In tool call exception/rejection handling: when hook message contains `AUTH_REQUIRED`, emit:
  ```json
  {
    "type": "presentation",
    "turn_id": turn_id,
    "presentation": {
      "type": "AUTH_CHALLENGE",
      "title": "Authentication Required",
      "message": "To view your accounts, check balances, or initiate transfers, please verify your identity.",
      "action": "OPEN_LOGIN_MODAL"
    }
  }
  ```

- [ ] **Step 3: Support session customer identity binding on login**
When a visitor logs in while keeping the chat open, upgrade the active WebSocket session context with the authenticated `customer_id` and `user_id` without discarding chat messages.

- [ ] **Step 4: Run backend tests**
```bash
PYTHONPATH=. ./venv/bin/pytest
```

- [ ] **Step 5: Commit changes**
```bash
git commit -m "feat(runtime): emit AUTH_CHALLENGE presentation and support live session upgrade"
```

---

### Task 3: Frontend Secure Auth Challenge Card & Seamless Login Transition

**Files:**
- Modify: `frontend/src/types/chat.ts`
- Modify: `frontend/src/components/chat/ChatPresentationCard.tsx`
- Modify: `frontend/src/context/ChatContext.tsx`
- Modify: `frontend/src/bank.css`

**Interfaces:**
- Consumes: `presentation.type === 'AUTH_CHALLENGE'`, `useBanking().openLoginModal`
- Produces: Interactive "Sign In Securely" chat card that launches the trusted OTP modal

- [ ] **Step 1: Update TypeScript types in `frontend/src/types/chat.ts`**
Add `AUTH_CHALLENGE` to presentation types:
```typescript
export interface AuthChallengePresentation {
  type: 'AUTH_CHALLENGE';
  title: string;
  message: string;
  action: 'OPEN_LOGIN_MODAL';
}
```

- [ ] **Step 2: Implement UI card in `ChatPresentationCard.tsx`**
When `presentation.type === 'AUTH_CHALLENGE'`:
Render a secure card with lock icon, clear explanatory copy, and a high-visibility button:
`[ 🔐 Sign In to View Your Account ]`.
Clicking the button invokes the top-level `openLoginModal()` (which launches the Firebase Phone Auth / OTP modal).

- [ ] **Step 3: Update `ChatContext.tsx` to handle post-login resumption**
When the user successfully signs in:
- WebSocket connection adopts the new authenticated session.
- Automatically prompts the agent with a system turn: `"User successfully authenticated. Please address their earlier banking request."`
- The unified agent immediately answers their original banking query (e.g. balance, transfers) with full customer data!

- [ ] **Step 4: Verify with frontend tests and build**
```bash
npm --prefix frontend test
npm --prefix frontend run build
```

- [ ] **Step 5: Commit changes**
```bash
git commit -m "feat(ui): add AUTH_CHALLENGE presentation card with one-click secure login trigger"
```

---

### Task 4: End-to-End Verification & Regression Testing

**Files:**
- Test: `tests/test_unified_agent_e2e.py`
- Verify: Local dev server at `http://127.0.0.1:8017`

- [ ] **Step 1: Run comprehensive backend test suite**
```bash
PYTHONPATH=. ./venv/bin/pytest
```

- [ ] **Step 2: Manual walkthrough verification**
1. Visit `http://127.0.0.1:8017` logged out.
2. Ask: *"What are your savings account interest rates and minimum balances?"*
   - Verify: Agent answers using public product tools (`search_public_products`).
3. Ask: *"What is my balance and recent transactions?"*
   - Verify: Agent denies direct access, explains sign-in is required, and displays the **`[ 🔐 Sign In to View Your Account ]`** card.
4. Click the button, complete OTP sign-in.
5. Verify: Chat seamlessly continues and the agent now retrieves real balance and ledger facts.
6. Ask: *"Can an existing customer open a fixed deposit?"*
   - Verify: Agent uses public product knowledge AND offers to start the fixed deposit workflow.
