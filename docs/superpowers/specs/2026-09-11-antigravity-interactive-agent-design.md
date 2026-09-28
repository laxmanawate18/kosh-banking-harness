# Design Document: Interactive Terminal Assistant with Antigravity SDK

**Date:** 2026-09-11  
**Status:** Approved  
**Author:** Antigravity  

## 1. Overview & Goal

The goal is to build an interactive terminal AI assistant powered by the official `google-antigravity` Python SDK and styled using `rich`. The agent will operate directly in the terminal, supporting conversational interaction, real-time reasoning/thought streaming, tool execution visibility, markdown token streaming, and safety-gated tool capabilities.

## 2. Architecture & File Structure

```
builder_ai/
├── requirements.txt          # Package dependencies: google-antigravity, rich
├── agent_cli.py              # Main CLI entrypoint, REPL loop, and streaming engine
├── verify_agent.py           # Automated test suite (headless prompt & tool execution)
└── README.md                 # Setup, configuration, and execution instructions
```

### Dependencies
- `google-antigravity` (>= 0.1.16): Provides the core `Agent`, `LocalAgentConfig`, and `CapabilitiesConfig` runtime classes.
- `rich` (>= 13.0.0): Provides terminal formatting, live text updating, panels for agent thoughts, syntax highlighting, and badges for tool calls.

## 3. Detailed Component Design

### 3.1 Agent Configuration & Capabilities
The CLI supports two modes configured via command-line arguments:
- **Safe Mode (Default)**: Initialized with `LocalAgentConfig(system_instructions=...)` without write capabilities. Agent can read files and answer queries safely.
- **Tools / Write Mode (`--allow-tools`)**: Initialized with `LocalAgentConfig(capabilities=CapabilitiesConfig(), system_instructions=...)`, giving the agent authority to run shell commands (`run_command`), create/edit files (`write_to_file`), etc.

### 3.2 Streaming Engine & Event Handling
When a user submits a prompt, `agent_cli.py` spawns concurrent handlers to process incoming event streams from `await agent.chat(prompt)`:
1. **Thought Stream (`response.thoughts`)**: Captured and displayed inside a distinct styled panel (`[italic dim]Thinking...[/]`).
2. **Tool Stream (`response.tool_calls`)**: Intercepted in real-time to display actionable visual cues, e.g., `[⚙️ Executing <tool_name> with args <args>]` and status badges.
3. **Response Stream (`response`)**: Tokens are streamed live into a Rich `Live` markdown buffer to give immediate typing feedback to the user.

### 3.3 REPL Loop & Commands
The REPL runs inside `asyncio.run()` with terminal input handled cleanly:
- Prompt symbol: `[bold cyan]antigravity>[/]`
- Built-in slash commands:
  - `/help`: Print usage instructions and active capabilities.
  - `/clear`: Clear the terminal screen buffer.
  - `/mode`: Print active capabilities (Safe vs Tools-Enabled).
  - `/exit` or `/quit`: Cleanly terminate the session.
- **Interrupt Handling**: Catching `KeyboardInterrupt` (`Ctrl+C`) while streaming aborts only the active query generation, preserving the agent session and returning to the input prompt. Catching `Ctrl+C` or `Ctrl+D` (EOF) at the empty prompt cleanly exits.

### 3.4 Headless Mode for Automation & Scripting
`agent_cli.py` also accepts a `--prompt "<query>"` argument. When provided, the agent processes the prompt, streams the thoughts and response to stdout, and exits with code 0 once done. This enables automated pipelines and testing.

## 4. Error Handling & Edge Cases

1. **Missing SDK or Runtime Binary**:
   If `import google.antigravity` fails, the script displays a clear diagnostic message directing the user to install the platform-specific wheel via `pip install google-antigravity`.
2. **API & Connection Errors**:
   Network drops or API exceptions during `agent.chat()` are caught within the query loop, formatted in red error boxes, and do not crash the interactive shell.
3. **Tool Execution Errors**:
   If a tool fails during execution (e.g. non-zero command exit), the error is surfaced in the tool event stream and rendered cleanly.

## 5. Verification & Testing Plan

1. **Environment Verification**:
   Ensure virtual environment is set up and `google-antigravity` + `rich` are installed.
2. **Automated Headless Smoke Tests (`verify_agent.py`)**:
   - Test basic chat and token streaming with `--prompt "Say hello world"`.
   - Test tool capability flag and tool call interception with `--allow-tools --prompt "List files in current directory"`.
3. **Interactive Manual Checklist**:
   - Verify slash commands (`/help`, `/clear`, `/exit`).
   - Verify `Ctrl+C` interrupt during active generation.
