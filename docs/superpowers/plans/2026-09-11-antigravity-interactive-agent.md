# Interactive Terminal Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a sample interactive AI assistant using the `google-antigravity` Python SDK and `rich`, featuring real-time thought streaming, tool execution badges, markdown response rendering, slash commands, and safety-gated permissions.

**Architecture:** An asynchronous Python CLI built around `Agent` and `LocalAgentConfig` from `google-antigravity`. User inputs are processed via `agent.chat()`, streaming thoughts, tool calls, and response tokens via concurrent async tasks styled with `rich.console.Console`. A headless `--prompt` mode facilitates automated verification.

**Tech Stack:**
- Python 3.10+ (Current: Python 3.14)
- `google-antigravity` >= 0.1.16
- `rich` >= 13.0.0
- Standard library: `asyncio`, `argparse`, `sys`

## Global Constraints

- Use the virtual environment at `./venv` for all executions (`./venv/bin/python`, `./venv/bin/pip`).
- Keep all files self-contained within `/Users/sudhirjaiswal/Downloads/builder_ai`.
- Handle `KeyboardInterrupt` (`Ctrl+C`) gracefully: during streaming, cancel the query without killing the REPL session; at the empty prompt, exit cleanly.
- Safe read-only mode by default; `--allow-tools` enables write/command execution tools via `CapabilitiesConfig()`.

---

### Task 1: Environment & Dependency Specification

**Files:**
- Create: `requirements.txt`
- Create: `.gitignore`

**Interfaces:**
- Produces: Base environment configuration files for reproducible installs.

- [ ] **Step 1: Create requirements.txt**

Write `requirements.txt`:
```txt
google-antigravity>=0.1.16
rich>=13.0.0
```

- [ ] **Step 2: Create .gitignore**

Write `.gitignore`:
```gitignore
venv/
__pycache__/
*.pyc
.env
```

- [ ] **Step 3: Verify requirements installation in venv**

Run: `./venv/bin/pip install -r requirements.txt`  
Expected: Requirement already satisfied / clean exit code 0.

- [ ] **Step 4: Commit**

```bash
git add requirements.txt .gitignore
git commit -m "chore: add requirements.txt and gitignore"
```

---

### Task 2: CLI Core & Streaming Engine (`agent_cli.py`)

**Files:**
- Create: `agent_cli.py`

**Interfaces:**
- Consumes: `google.antigravity.Agent`, `LocalAgentConfig`, `CapabilitiesConfig`
- Produces: `async def run_prompt(agent, prompt, console)` and CLI argument parser supporting `--prompt`, `--allow-tools`, and `--system-prompt`.

- [ ] **Step 1: Write agent_cli.py with streaming logic and headless mode**

Create `agent_cli.py` implementing:
1. `build_agent_config(allow_tools: bool, system_prompt: str | None) -> LocalAgentConfig`
2. `async def stream_chat(agent: Agent, prompt: str, console: Console)`:
   - Sets up `response = await agent.chat(prompt)`
   - Concurrently monitors:
     - `response.thoughts`: prints thoughts in dimmed/italic panel
     - `response.tool_calls`: prints badges for tool execution
     - Token stream (`async for token in response`): prints markdown / text chunks
   - Catches `asyncio.CancelledError` and calls `await response.cancel()` if cancelled
3. CLI parser with `--prompt`, `--allow-tools`, `--system-prompt`.

- [ ] **Step 2: Test headless run with simple query**

Run: `./venv/bin/python agent_cli.py --prompt "Explain the word serendipity in one sentence."`  
Expected: Exit code 0, agent outputs explanation with streamed output.

- [ ] **Step 3: Test tool capabilities in headless mode**

Run: `./venv/bin/python agent_cli.py --allow-tools --prompt "List files in the current directory"`  
Expected: Exit code 0, tool execution event printed, files listed.

- [ ] **Step 4: Commit**

```bash
git add agent_cli.py
git commit -m "feat: implement agent_cli core streaming engine and headless mode"
```

---

### Task 3: Interactive REPL & Slash Commands

**Files:**
- Modify: `agent_cli.py`

**Interfaces:**
- Consumes: `agent_cli.stream_chat`
- Produces: `async def interactive_repl(agent, console, allow_tools: bool)` with `/help`, `/clear`, `/mode`, `/exit`.

- [ ] **Step 1: Add interactive REPL loop to agent_cli.py**

Implement:
- Welcome banner with rich styling displaying Antigravity SDK version and capability mode.
- Interactive input loop using `console.input("[bold cyan]antigravity>[/] ")`.
- Handling for slash commands:
  - `/help`: Show command list and usage.
  - `/clear`: Clear terminal using `console.clear()`.
  - `/mode`: Display active permissions (Read-only vs Tools-enabled).
  - `/exit` or `/quit`: Break loop and exit cleanly.
- `KeyboardInterrupt` (`Ctrl+C`) handling: cancel active `stream_chat` task when streaming; exit if pressed at empty prompt.

- [ ] **Step 2: Test non-interactive piped input into REPL**

Run: `echo -e "/help\n/mode\n/exit" | ./venv/bin/python agent_cli.py`  
Expected: Exit code 0, displays help info, active mode, and goodbye message.

- [ ] **Step 3: Commit**

```bash
git add agent_cli.py
git commit -m "feat: add interactive REPL loop with slash commands and interrupt handling"
```

---

### Task 4: Automated Verification Suite (`verify_agent.py`)

**Files:**
- Create: `verify_agent.py`

**Interfaces:**
- Consumes: `agent_cli.py`
- Produces: Smoke test suite validating imports, configuration factory, headless chat execution, and tool execution.

- [ ] **Step 1: Write verify_agent.py**

Create `verify_agent.py` containing:
- Test 1: Validate import and binary binding of `google.antigravity`.
- Test 2: Validate `build_agent_config` with and without tools.
- Test 3: Run headless prompt subprocess: `python agent_cli.py --prompt "Ping"` and assert exit code 0 and non-empty output.
- Test 4: Run slash command pipe test: verify `/help` output.

- [ ] **Step 2: Run verification test suite**

Run: `./venv/bin/python verify_agent.py`  
Expected: All tests PASS with exit code 0.

- [ ] **Step 3: Commit**

```bash
git add verify_agent.py
git commit -m "test: add automated verification suite for agent CLI"
```

---

### Task 5: Documentation & Usage Guide (`README.md`)

**Files:**
- Create: `README.md`

**Interfaces:**
- Produces: User-facing documentation with quickstart, commands, flags, and architecture explanation.

- [ ] **Step 1: Write README.md**

Document:
- Project overview & features
- Quickstart setup instructions (venv, pip install)
- Running interactive mode (`python agent_cli.py`)
- Running with tools enabled (`python agent_cli.py --allow-tools`)
- Running headless prompts for scripting (`python agent_cli.py --prompt "..."`)
- Available slash commands (`/help`, `/clear`, `/mode`, `/exit`)

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add comprehensive README for Antigravity interactive assistant"
```
