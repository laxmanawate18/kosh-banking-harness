# Design Document: Antigravity Studio Dev UI

**Date:** 2026-09-11  
**Status:** Approved  
**Author:** Antigravity  

## 1. Overview & Goals

The goal is to build **Antigravity Studio Dev UI**, an interactive developer interface for the `google-antigravity` Python SDK inspired by ADK Dev UI. It provides real-time visibility into the agent's internal workings:
- Conversational chat workspace with token-by-token streaming and Markdown code formatting.
- Live, granular trace timeline showing model reasoning (`types.Thought`), tool execution (`types.ToolCall`, `types.ToolResult`), and token usage metrics.
- Dynamic runtime configuration (Model selection, Thinking Effort level, Tools toggle).
- One-command startup (`python dev_ui.py`) with zero npm build dependencies.

## 2. Architecture & File Structure

```
builder_ai/
├── dev_ui.py                 # FastAPI server, WebSocket endpoint (/ws/chat), Antigravity Agent bridge
├── static/
│   ├── index.html            # Dual-pane UI structure (Chat + Trace Ledger)
│   ├── app.js                # WebSocket client, event dispatcher, DOM renderer, Markdown formatter
│   └── styles.css            # Dark mode styles, trace badges, animations, scrollbars
├── requirements.txt          # fastapi, uvicorn, google-antigravity, rich, python-dotenv
├── test_dev_ui.py            # Automated tests for WebSocket event contract and backend endpoints
└── README.md                 # Updated documentation with Dev UI instructions
```

## 3. Detailed Component Design

### 3.1 Backend: FastAPI & WebSocket Agent Bridge (`dev_ui.py`)
- **Web Server**: Uses `fastapi` and `uvicorn` to serve static assets and handle WebSocket connections on `http://127.0.0.1:8000`.
- **WebSocket Route (`/ws/chat`)**:
  - Manages persistent browser connections and Antigravity `Agent` instances.
  - Receives JSON commands from the client:
    - `prompt`: `{ type: "prompt", prompt: string, model: string, thinking_level: string, allow_tools: boolean }`
    - `clear`: `{ type: "clear" }` (resets conversation memory)
    - `cancel`: `{ type: "cancel" }` (aborts current response stream)
  - Intercepts Antigravity SDK chunks (`response.chunks`) and dispatches structured JSON events to the browser:
    - `turn_start`: `{ type: "turn_start", turn_id: string, timestamp: number }`
    - `thought`: `{ type: "thought", text: string, timestamp: number }`
    - `tool_call`: `{ type: "tool_call", name: string, args: object, id: string, timestamp: number }`
    - `tool_result`: `{ type: "tool_result", name: string, result: any, id: string, duration_ms: number }`
    - `text_delta`: `{ type: "text_delta", text: string }`
    - `turn_complete`: `{ type: "turn_complete", usage: object, duration_ms: number, stop_reason: string }`
    - `error`: `{ type: "error", message: string }`

### 3.2 Frontend: Dual-Pane Studio SPA (`static/`)
- **Header Bar**:
  - Model Selector (`gemini-3.6-flash`, `gemini-3.8-flash`, etc.)
  - Thinking Effort dropdown (`minimal`, `low`, `medium`, `high`, `extra_high`)
  - Tools Mode toggle (`Safe Mode` vs `Tools Enabled`)
  - Session actions: `Clear Chat`, `Export Traces (JSON)`, Connection status badge
- **Left Pane: Chat Workspace**:
  - Clean message thread with distinct User and Assistant cards.
  - In-message live collapsible thinking drawer (`🧠 Reasoning (N chars)`).
  - In-message tool badges with status indicators.
  - Real-time Markdown token streaming with syntax highlighting and code copy buttons.
  - Prompt input with auto-expanding textarea, `Enter` to send, `Shift+Enter` for newlines, and a `Stop` button during generation.
- **Right Pane: Live Trace & Event Ledger**:
  - Filter tabs: `All Events`, `Thoughts`, `Tool Calls`, `Raw JSON`.
  - Chronological timeline cards with millisecond timestamps:
    - **Thought Card**: Full stream of model internal reasoning.
    - **Tool Card**: Collapsible JSON inspector showing exact arguments, execution output, and execution time.
    - **Turn Summary Card**: Token usage metrics (`prompt_tokens`, `output_tokens`, `total_tokens`), model name, and elapsed latency.
  - Search / filter input to instantly find specific tool invocations or keywords.

## 4. Error Handling & Edge Cases

- **WebSocket Disconnection / Reconnection**: Auto-reconnect with visual banner.
- **Upstream Model Errors**: Surfaced cleanly as error events in both the chat stream and the trace ledger without crashing the server.
- **Generation Cancellation**: Clicking the "Stop" button sends a `cancel` message over WebSocket which triggers `await response.cancel()` on the Antigravity `ChatResponse`.

## 5. Verification & Testing Plan

1. **Automated WebSocket Contract Tests (`test_dev_ui.py`)**:
   - Test FastAPI static file delivery (`GET /`).
   - Test WebSocket connection and message protocol (`/ws/chat`).
   - Test `clear` command and error handling on invalid payloads.
2. **End-to-End Live Verification**:
   - Start Dev UI via `python dev_ui.py`.
   - Send live prompts across different models and effort levels.
   - Verify tool calls (`list_directory`) render live in both the chat drawer and the right-hand trace inspector.
   - Test generation cancellation.
