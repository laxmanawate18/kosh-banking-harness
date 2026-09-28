# Design Document: Antigravity Studio with Multi-Session Management

**Date:** 2026-09-11  
**Status:** Approved  
**Author:** Antigravity  

## 1. Overview & Goals

The goal is to expand **Antigravity Studio Dev UI** into a full-featured 3-column AI development studio, remove legacy CLI files, and introduce file-backed multi-session management:
- Clean up legacy CLI files (`agent_cli.py`, `verify_agent.py`) to focus purely on the Web Dev Studio.
- Add a 3-column responsive layout: Collapsible Sessions Sidebar + Chat Workspace + Live Trace Inspector & Timeline.
- Implement server-side session persistence in `sessions/<session_id>.json` storing chat messages, reasoning thoughts, tool calls, and trace events.
- Provide full session lifecycle: Create new chats, auto-name based on initial prompts, switch between past sessions, rename, search, and delete.

## 2. Architecture & File Structure

```
builder_ai/
├── dev_ui.py                 # FastAPI backend, REST API for sessions, WebSocket trace engine
├── static/
│   ├── index.html            # 3-Column Studio layout (Sidebar + Chat + Trace Inspector)
│   ├── app.js                # Session management, WebSocket client, trace rendering, search
│   └── styles.css            # Dark theme styles, sidebar transitions, animations
├── sessions/                 # File storage for saved session JSON files
├── test_dev_ui.py            # Automated test suite for sessions API and WebSocket contracts
├── requirements.txt          # Dependencies: fastapi, uvicorn, google-antigravity, python-dotenv
└── README.md                 # Documentation for Antigravity Studio Dev UI
```

### Removed Files:
- `agent_cli.py`
- `verify_agent.py`

## 3. Detailed Component Design

### 3.1 Backend: Session Store & Endpoints (`dev_ui.py`)
- **Session File Store**: Sessions stored in `sessions/<id>.json`.
- **REST Endpoints**:
  - `GET /api/sessions`: List saved sessions metadata (`id`, `title`, `created_at`, `updated_at`, `message_count`, `model`).
  - `POST /api/sessions`: Create new session with generated UUID.
  - `GET /api/sessions/{id}`: Load complete session including `messages` and `traces`.
  - `PATCH /api/sessions/{id}`: Update title or metadata.
  - `DELETE /api/sessions/{id}`: Delete session file.
- **WebSocket Endpoint (`/ws/chat?session_id=<id>`)**:
  - Automatically loads and updates session file on disk as thoughts, tool calls, and text deltas stream.
  - Generates auto-title from the first prompt if session title is default.

### 3.2 Frontend: 3-Column Studio SPA (`static/`)
- **Left Sidebar (250px, Collapsible)**:
  - Header with `+ New Chat` button and search filter.
  - List of sessions with active state indicator, relative timestamps, rename, and delete actions.
  - Toggle button in top header to collapse/expand sidebar with smooth CSS transition.
- **Center Pane (Chat Workspace)**:
  - Session header with title and model badge.
  - Message stream with Markdown formatting, syntax highlighting, thought accordions, and tool execution badges.
  - Prompt input with auto-expanding textarea, Enter/Shift+Enter handling, Send and Stop buttons.
- **Right Pane (Live Trace Inspector)**:
  - Filter tabs: `All`, `Thoughts`, `Tools`, `Raw JSON`.
  - Real-time event cards with timestamps, collapsible JSON inspectors, duration, and token metrics.
  - Search input to filter trace cards.
  - Export trace to JSON button.

## 4. Error Handling & Edge Cases

- **Non-existent Session ID**: Creating or loading non-existent session safely creates a new session.
- **Concurrent Session Edits**: Atomic file write with error trapping.
- **WebSocket Disconnection**: Auto-reconnect preserving current session context.

## 5. Verification & Testing Plan

1. **Automated REST & WebSocket Suite (`test_dev_ui.py`)**:
   - Test session creation, listing, retrieval, renaming, and deletion.
   - Test WebSocket connection with `session_id` parameter and message auto-persistence.
2. **Interactive UI Verification**:
   - Create multiple sessions, verify switching loads corresponding chat messages and traces.
   - Verify sidebar collapse/expand.
   - Verify session search and deletion.
