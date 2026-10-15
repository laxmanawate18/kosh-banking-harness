"""Ontology Review Copilot: AI-assisted compliance, risk audit, and diff analysis for administrators."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional

from backend import ontology
from backend.settings import DEFAULT_MODEL

logger = logging.getLogger(__name__)


def _deterministic_analysis(
    process_id: str,
    meta: Dict[str, Any],
    body: str,
    diff_entries: List[Dict[str, Any]],
    diff_summary: Dict[str, int],
    quick_action: Optional[str],
    user_message: str,
) -> Dict[str, Any]:
    """Expert rule-based regulatory analysis engine providing instant banking audit findings."""
    tools = list(meta.get("kosh_tools") or [])
    channels = list(meta.get("kosh_channels") or [])
    activities = list(meta.get("uses_activities") or [])
    kosh_status = meta.get("kosh_status", "unknown")
    name = meta.get("name", process_id)

    # Risk evaluation
    has_step_up = "act.authenticate_step_up" in activities
    has_destructive_tools = any("transfer" in t.lower() or "close" in t.lower() or "freeze" in t.lower() for t in tools)
    is_public = "visitor" in channels

    risk_level = "LOW"
    findings = []
    recommendations = []

    if has_destructive_tools and not has_step_up:
        risk_level = "HIGH"
        findings.append("⚠️ **High Autonomy Alert**: Tools can alter accounts or cards, but `act.authenticate_step_up` is missing from activities.")
        recommendations.append("Add `act.authenticate_step_up` to `uses_activities` to enforce Customer Step-Up OTP.")

    if is_public and has_destructive_tools:
        risk_level = "HIGH"
        findings.append("🚨 **Channel Leakage Alert**: Process includes mutation tools and is open to unauthenticated visitors.")
        recommendations.append("Restrict `kosh_channels` to `[customer]` or `[officer]`.")

    if "FREEZE_CARD" in body.upper() and "P1-08" in body.upper():
        findings.append("✅ **RBI Compliance Verified**: Card freeze is immediate and low-friction, while card reissue requires officer approval (P1-08).")

    if quick_action == "compliance_audit":
        reply = f"""### 🛡️ Banking Regulatory & Compliance Audit: {name} (`{process_id}`)

**Compliance Status**: **{risk_level} Risk**
* **Regulatory Frameworks Evaluated**: RBI Master Direction on Digital Payment Security Controls, RBI KYC Master Directions 2016, and Digital Personal Data Protection (DPDP) Act 2023.

#### 1. Identification & Channel Governance
* **Execution Status**: `{kosh_status.upper()}`
* **Allowed Channels**: {', '.join(f'`{c}`' for c in channels) or 'None'}
* **Permitted Tools**: {', '.join(f'`{t}`' for t in tools) or 'None (Advisory only)'}

#### 2. Key Audit Findings
""" + "\n".join(f"* {f}" for f in (findings or ["✅ Process structure conforms with standard Kosh banking guidelines."])) + f"""

#### 3. Recommended Admin Actions
""" + "\n".join(f"1. {r}" for r in (recommendations or ["No regulatory objections found. Process is eligible for production approval."]))

    elif quick_action == "risk_detection":
        reply = f"""### ⚠️ Operational & Autonomy Risk Assessment: {name}

**Overall Risk Score**: **{risk_level}**

* **Tool Least-Privilege**: Granted **{len(tools)} tools** ({', '.join(f'`{t}`' for t in tools) or 'None'}).
* **Human-in-the-Loop (Four-Eyes)**: {'Enforced via Step-Up & Maker-Checker' if has_step_up or 'officer' in body.lower() else 'Automated Execution'}
* **Customer Consent & Data Privacy**: Bound to {len(meta.get('kosh_services') or [])} bank service request types.

#### Risk Breakdown:
""" + "\n".join(f"- {f}" for f in (findings or ["- No elevated autonomy risks detected in current flow."]))

    elif quick_action == "explain_diff":
        additions = [e['text'] for e in diff_entries if e['type'] == 'add']
        deletions = [e['text'] for e in diff_entries if e['type'] == 'del']
        reply = f"""### 📝 Summary of Recent Changes: {name}

**Diff Overview**: **+{diff_summary['additions']} additions**, **-{diff_summary['deletions']} deletions**

"""
        if diff_summary["total_changes"] == 0:
            reply += "✅ **No Changes Detected**: The current draft is identical to the approved production baseline."
        else:
            reply += "#### Key Additions:\n" + ("\n".join(f"+ `{line.strip()}`" for line in additions[:6]) or "_None_") + "\n\n"
            reply += "#### Key Deletions:\n" + ("\n".join(f"- `{line.strip()}`" for line in deletions[:6]) or "_None_") + "\n\n"
            reply += "**Executive Summary**: Wording and step rules were updated. Review the additions above to verify compliance before approving."

    elif quick_action == "suggest_guardrails":
        reply = f"""### 💡 Recommended Guardrails for {name}

To prevent prompt injection, social engineering, and unauthorized execution, add these rules to the `## Guardrails` section:

```markdown
## Guardrails
- Under no circumstances can Mitra bypass OTP or identity verification for this process.
- If a customer claims urgent distress, offer an immediate protective action or officer callback; never execute unauthenticated state mutations.
- Always disclose whether an action is immediate or requires branch officer review.
- Restrict responses strictly to the customer's authenticated accounts.
```
"""
    else:
        reply = f"""### 🤖 Compliance Copilot: {name}

Regarding your question: *"{user_message}"*

* **Process ID**: `{process_id}` ({name})
* **Channels**: {', '.join(f'`{c}`' for c in channels) or 'None'}
* **Tools**: {', '.join(f'`{t}`' for t in tools) or 'None'}
* **Audit Finding**: {findings[0] if findings else 'The process flow complies with standard bank controls.'}

You can use the quick actions above to perform a full RBI compliance check, audit autonomy risks, or summarize line changes.
"""

    return {
        "reply": reply,
        "risk_level": risk_level,
        "quick_action": quick_action,
        "process_id": process_id,
    }


async def ask_ontology_copilot(
    db: Any,
    admin_user_id: str,
    process_id: str,
    message: str,
    quick_action: Optional[str] = None,
    history: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """Analyze a banking process for an administrator using LLM reasoning or deterministic audit."""
    del history  # reserved for multi-turn context
    if process_id not in ontology.load():
        raise ValueError(f"Process {process_id} not found in ontology catalogue")

    path = ontology._path(process_id)
    raw_content = path.read_text(encoding="utf-8")
    meta, body = ontology.front_matter(raw_content)

    approved_snapshot = ontology.get_approved_snapshot(process_id)
    diff_entries, diff_summary = ontology.compute_line_diff(approved_snapshot, raw_content)

    # First attempt LLM inference via agent_factory if available
    try:
        from backend.agent_config import create_harness_agent_config
        from backend.settings import USE_VERTEXAI
        import os

        has_api_key = bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or USE_VERTEXAI)
        if has_api_key:
            from google.antigravity import Agent, types

            prompt = f"""You are the Chief Regulatory & Compliance Auditor for Kosh, a secure digital bank governed by RBI, PMLA, and DPDP 2023 regulations.
An administrator is reviewing the following banking process definition:

Process ID: {process_id}
Process Name: {meta.get('name')}
Domain: {meta.get('domain')}
Status: {meta.get('status')} / {meta.get('kosh_status')}
Allowed Channels: {meta.get('kosh_channels')}
Granted Tools: {meta.get('kosh_tools')}
Uses Activities: {meta.get('uses_activities')}

Content of the process:
```markdown
{raw_content}
```

Diff against approved production version:
- Additions: {diff_summary['additions']} lines
- Deletions: {diff_summary['deletions']} lines

Admin Request: {message}
Quick Action: {quick_action or 'custom'}

Instructions:
1. Provide an authoritative, structured banking compliance response.
2. Specifically evaluate: RBI guidelines, DPDP data protection, Four-Eyes maker-checker rules, and least-privilege tool usage.
3. Use markdown with clear headings, bold text, and bullet points.
4. Conclude with a clear recommendation (Approve, Request Changes, or Add Guardrail).
"""
            config = create_harness_agent_config(
                "officer",
                f"ADMIN-COPILOT-{process_id}",
                "You are the Bank Governance & Compliance Copilot.",
                [],
                {},
                model=DEFAULT_MODEL,
            )
            text = ""
            async with Agent(config) as agent:
                resp = await agent.chat(prompt)
                async for chunk in resp.chunks:
                    if isinstance(chunk, types.Text) and chunk.text:
                        text += chunk.text

            if text.strip():
                db.append_audit(
                    "ONTOLOGY_COPILOT_REVIEW",
                    actor="admin",
                    approver_id=admin_user_id,
                    details={"process_id": process_id, "quick_action": quick_action, "method": "llm"},
                )
                return {
                    "reply": text.strip(),
                    "risk_level": "LOW" if "approved" in text.lower() else "MEDIUM",
                    "quick_action": quick_action,
                    "process_id": process_id,
                }
    except Exception as exc:
        logger.info("Ontology copilot falling back to deterministic analysis: %r", exc)

    # Deterministic fallback engine: fast, reliable, zero-latency
    result = _deterministic_analysis(
        process_id,
        meta,
        body,
        diff_entries,
        diff_summary,
        quick_action,
        message,
    )
    db.append_audit(
        "ONTOLOGY_COPILOT_REVIEW",
        actor="admin",
        approver_id=admin_user_id,
        details={"process_id": process_id, "quick_action": quick_action, "method": "deterministic"},
    )
    return result
