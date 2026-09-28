# Antigravity Studio Dev UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Antigravity Studio Dev UI, a real-time developer web interface providing live streaming traces of model reasoning thoughts, tool calls, tool results, conversational markdown, and usage metrics from the `google-antigravity` SDK.

**Architecture:** A FastAPI + WebSocket backend (`dev_ui.py`) bridging the browser to an `Agent` instance. A dual-pane dark-mode frontend (`static/index.html`, `static/app.js`, `static/styles.css`) renders the live chat stream and an ADK-style granular trace ledger in real time.

**Tech Stack:**
- Python 3.10+ (FastAPI, Uvicorn, WebSockets, google-antigravity, python-dotenv)
- Frontend: Vanilla JavaScript, Tailwind CSS (via CDN), Marked.js, Highlight.js, Lucide Icons

## Global Constraints

- Run all server commands and tests inside `./venv`.
- Zero npm build steps required; frontend assets are served directly from `./static/`.
- Handle WebSocket disconnects, cancels, and model retries cleanly.
- Support dynamic model selection, thinking effort levels (`minimal`, `low`, `medium`, `high`, `extra_high`), and tools capability toggles.

---

### Task 1: Backend FastAPI Server & WebSocket Bridge (`dev_ui.py`)

**Files:**
- Create: `dev_ui.py`
- Modify: `requirements.txt`

**Interfaces:**
- Produces: FastAPI app with `/ws/chat` endpoint, static file mount, and `Agent` chunk-to-JSON event pipeline.

- [ ] **Step 1: Update requirements.txt if needed**

Ensure `fastapi>=0.100.0` and `uvicorn[standard]>=0.20.0` are listed in `requirements.txt`.

- [ ] **Step 2: Implement dev_ui.py**

Create `dev_ui.py` containing:
- `app = FastAPI(title="Antigravity Studio Dev UI")`
- Static file mounting for `/static` directory and root route `GET /` serving `static/index.html`.
- API endpoint `GET /api/models` returning available models list.
- WebSocket endpoint `/ws/chat`:
  - Maintains `Agent` instance for the session.
  - Handles incoming `{ type: "prompt", prompt: "...", model: "...", effort: "...", allow_tools: bool }`.
  - Dispatches `turn_start`, `thought`, `tool_call`, `tool_result`, `text_delta`, `turn_complete`, `error`.
  - Handles `{ type: "cancel" }` to cancel active turn.
  - Handles `{ type: "clear" }` to reset conversation context.

- [ ] **Step 3: Test backend server startup**

Run: `./venv/bin/python -c "import dev_ui; print('dev_ui imported successfully')"`  
Expected: Clean import with code 0.

- [ ] **Step 4: Commit**

```bash
git add dev_ui.py requirements.txt
git commit -m "feat: implement FastAPI backend and WebSocket bridge for Dev UI"
```

---

### Task 2: Frontend Studio SPA (`static/`)

**Files:**
- Create: `static/index.html`
- Create: `static/styles.css`
- Create: `static/app.js`

**Interfaces:**
- Consumes: `/ws/chat` WebSocket events
- Produces: Responsive dual-pane UI (Chat Workspace + Live Trace Inspector & Timeline)

- [ ] **Step 1: Create static/index.html**

Write `static/index.html` with:
- Top Header: Title, Model Selector dropdown, Thinking Effort dropdown, Tools Toggle switch, Clear Button, Export Traces Button, Connection Status pill.
- Left Pane (Chat): Message container, in-message thinking accordions, tool cards, markdown bubbles, input textarea with Auto-resize, Send button, and Stop button.
- Right Pane (Trace Inspector): Tab filters (`All`, `Thoughts`, `Tools`, `JSON`), search input, and chronological event ledger cards.
- Load Tailwind CSS, Marked.js, Highlight.js, and Lucide icons via CDN.

- [ ] **Step 2: Create static/styles.css**

Write `static/styles.css` containing dark theme color variables, custom scrollbars, pulse indicators for active tool runs, thought box transitions, and syntax highlight overrides.

- [ ] **Step 3: Create static/app.js**

Write `static/app.js` containing:
- WebSocket connection manager with automatic reconnect and message queues.
- State management for active turn, event history, filter state, and current config.
- Event handlers for `thought`, `tool_call`, `tool_result`, `text_delta`, `turn_complete`, `error`.
- Live DOM rendering:
  - Updates in-message thinking accordion character count and text.
  - Inserts tool execution badges with formatted JSON expanders.
  - Appends text deltas to Marked.js stream.
  - Appends timeline cards to the right-hand Inspector with timestamps and filters.
- Trace Export to JSON download.

- [ ] **Step 4: Commit**

```bash
git add static/
git commit -m "feat: implement dual-pane Dev Studio frontend SPA"
```

---

### Task 3: Automated Testing Suite (`test_dev_ui.py`)

**Files:**
- Create: `test_dev_ui.py`

**Interfaces:**
- Produces: Test suite verifying static asset delivery, models API, and WebSocket event serialization.

- [ ] **Step 1: Write test_dev_ui.py**

Create `test_dev_ui.py` with:
- Test 1: `GET /` returns status 200 with HTML content.
- Test 2: `GET /api/models` returns model choices including `gemini-3.6-flash`.
- Test 3: WebSocket connection and `clear` event handling using `starlette.testclient.TestClient`.
- Test 4: WebSocket mock event dispatch contract.

- [ ] **Step 2: Run test suite**

Run: `./venv/bin/python test_dev_ui.py`  
Expected: All tests PASS with exit code 0.

- [ ] **Step 3: Commit**

```bash
git add test_dev_ui.py
git commit -m "test: add automated test suite for Dev UI"
```

---

### Task 4: Documentation & Integration (`README.md`)

**Files:**
- Modify: `README.md`

**Interfaces:**
- Produces: Documentation for launching and using the Dev Studio UI.

- [ ] **Step 1: Update README.md**

Add "Antigravity Dev Studio UI" section with one-command launch instructions:
```bash
python dev_ui.py
# Open http://localhost:8000 in your browser
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add Dev Studio UI usage instructions to README"
```
