# Antigravity Studio with Multi-Session Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the project into a pure web-based AI Development Studio with a 3-column layout (Collapsible Sessions Sidebar, Chat Workspace, and ADK-Style Live Trace Inspector) and disk-backed multi-session persistence.

**Architecture:** A FastAPI backend (`dev_ui.py`) managing JSON-backed sessions in `sessions/`, REST endpoints for session CRUD, and a WebSocket pipeline streaming Antigravity SDK reasoning thoughts and tool traces into a 3-column dark-themed SPA.

**Tech Stack:**
- Python 3.10+ (FastAPI, Uvicorn, WebSockets, google-antigravity, python-dotenv)
- Frontend: Tailwind CSS, Marked.js, Highlight.js, Lucide Icons

## Global Constraints

- Remove legacy CLI files (`agent_cli.py`, `verify_agent.py`) completely.
- Keep session files in `./sessions/<session_id>.json`.
- Maintain test coverage via `./venv/bin/python test_dev_ui.py`.

---

### Task 1: Clean Up Legacy CLI Files

**Files:**
- Delete: `agent_cli.py`
- Delete: `verify_agent.py`

**Interfaces:**
- Produces: Streamlined repository without legacy CLI files.

- [ ] **Step 1: Remove legacy files**

Run: `rm agent_cli.py verify_agent.py`  
Expected: Files removed cleanly.

- [ ] **Step 2: Commit cleanup**

```bash
git add -u
git commit -m "chore: remove legacy CLI files agent_cli.py and verify_agent.py"
```

---

### Task 2: Backend Session Storage & REST Endpoints (`dev_ui.py`)

**Files:**
- Modify: `dev_ui.py`

**Interfaces:**
- Produces: `sessions/` directory, REST endpoints (`/api/sessions`), and WebSocket session auto-saving.

- [ ] **Step 1: Implement session store in dev_ui.py**

Add:
- `SESSIONS_DIR = BASE_DIR / "sessions"` (auto-created).
- Functions: `list_sessions()`, `get_session(id)`, `save_session(id, data)`, `delete_session(id)`, `create_new_session()`.
- REST routes:
  - `GET /api/sessions`: Returns list of sessions sorted by `updated_at` desc.
  - `POST /api/sessions`: Creates and returns new session metadata.
  - `GET /api/sessions/{session_id}`: Returns full session with messages and traces.
  - `PATCH /api/sessions/{session_id}`: Renames session title.
  - `DELETE /api/sessions/{session_id}`: Deletes session file.
- WebSocket `/ws/chat`:
  - Supports `session_id` query param.
  - Automatically records user prompt, assistant response text, thoughts, and tool calls into the session JSON.
  - Auto-titles session from the first user prompt.

- [ ] **Step 2: Test backend session creation**

Run: `./venv/bin/python -c "import dev_ui; print('dev_ui loaded with sessions support')"`  
Expected: Clean exit code 0.

- [ ] **Step 3: Commit**

```bash
git add dev_ui.py
git commit -m "feat: add session persistence and REST API in dev_ui.py"
```

---

### Task 3: 3-Column Studio Frontend (`static/`)

**Files:**
- Modify: `static/index.html`
- Modify: `static/styles.css`
- Modify: `static/app.js`

**Interfaces:**
- Consumes: REST `/api/sessions` and `/ws/chat?session_id=...`
- Produces: 3-column UI with collapsible sessions sidebar, chat workspace, and live trace ledger.

- [ ] **Step 1: Update static/index.html**

Add:
- Sidebar toggle button in top-left header (`[≡]`).
- Left Sidebar container (`#sidebar`):
  - `+ New Chat` button.
  - Search input (`#sessionSearchInput`).
  - Scrollable sessions list (`#sessionsList`).
- Chat header displaying current session title.

- [ ] **Step 2: Update static/styles.css**

Add:
- Sidebar transition classes (`#sidebar { transition: width 0.2s ease, margin 0.2s ease; }`).
- Active session card styling.
- Rename inline input styling.

- [ ] **Step 3: Update static/app.js**

Add:
- Session management: `fetchSessions()`, `createSession()`, `selectSession(id)`, `renameSession(id, title)`, `deleteSession(id)`.
- Automatic sidebar search filtering.
- State persistence of current active `sessionId` in `localStorage`.
- WebSocket reconnect with `?session_id=<active_id>`.
- Sidebar collapse/expand toggle handler.

- [ ] **Step 4: Commit**

```bash
git add static/
git commit -m "feat: implement 3-column layout with collapsible sessions sidebar"
```

---

### Task 4: Automated Testing Suite (`test_dev_ui.py`)

**Files:**
- Modify: `test_dev_ui.py`

**Interfaces:**
- Produces: Test suite validating session CRUD endpoints and WebSocket auto-persistence.

- [ ] **Step 1: Update test_dev_ui.py with session tests**

Add:
- Test session listing `GET /api/sessions`.
- Test session creation `POST /api/sessions`.
- Test session retrieval `GET /api/sessions/{id}`.
- Test session rename `PATCH /api/sessions/{id}`.
- Test session deletion `DELETE /api/sessions/{id}`.
- Test WebSocket connection with `session_id` query param.

- [ ] **Step 2: Run test suite**

Run: `./venv/bin/python test_dev_ui.py`  
Expected: All tests PASS with exit code 0.

- [ ] **Step 3: Commit**

```bash
git add test_dev_ui.py
git commit -m "test: add test suite for session management and WebSocket contracts"
```

---

### Task 5: Documentation & Integration (`README.md`)

**Files:**
- Modify: `README.md`

**Interfaces:**
- Produces: Clean, pure Web Dev Studio documentation.

- [ ] **Step 1: Update README.md**

Refocus README entirely on Antigravity Studio Dev UI (quickstart, 3-column features, session management, API endpoints, testing).

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README for 3-column Antigravity Studio"
```
