"""Database-backed conversation persistence and public serialization."""

from __future__ import annotations

import time
import uuid
from typing import Any, Dict, List, Optional

from banking_db import db


def list_sessions_metadata(user_id: Optional[str] = None) -> List[Dict[str, Any]]:
    return db.list_conversations(user_id=user_id)


def load_session(session_id: str) -> Optional[Dict[str, Any]]:
    return db.get_conversation(session_id)


def save_session(session_data: Dict[str, Any]) -> None:
    if not session_data.get("id"):
        return
    session_data["updated_at"] = time.time()
    db.save_conversation(session_data)


def create_session_data(
    title: str = "New Chat",
    *,
    user_id: Optional[str] = None,
    customer_id: Optional[str] = None,
    initial_messages: Optional[List[Dict[str, Any]]] = None,
    session_id: Optional[str] = None,
) -> Dict[str, Any]:
    now = time.time()
    session = {
        "id": session_id or str(uuid.uuid4()),
        "title": title or "New Chat",
        "created_at": now,
        "updated_at": now,
        "product": "sentinel-v2",
        "user_id": user_id,
        "customer_id": customer_id,
        "messages": list(initial_messages or []),
        "traces": [],
    }
    save_session(session)
    return session


def sanitized_session(session: Dict[str, Any]) -> Dict[str, Any]:
    """Return customer-safe history without internal tool payloads or thoughts."""
    messages = []
    for item in session.get("messages", []):
        message = {key: item.get(key) for key in ("role", "text", "timestamp")}
        for key in ("presentation", "presentations", "toolResult", "salesAction"):
            if key in item:
                message[key] = item[key]
        if isinstance(item.get("attachments"), list):
            message["attachments"] = [
                {
                    "name": str(attachment.get("name") or "attachment"),
                    "mime_type": str(attachment.get("mime_type") or "image/jpeg"),
                    "size_bytes": attachment.get("size_bytes", 0),
                    "data_base64": attachment.get("data_base64", ""),
                }
                for attachment in item["attachments"]
                if isinstance(attachment, dict)
            ]
        messages.append(message)

    safe_trace_types = {"intent_bound", "turn_start", "turn_complete", "cancelled", "error"}
    return {
        "id": session.get("id"),
        "title": session.get("title", "Untitled Chat"),
        "created_at": session.get("created_at"),
        "updated_at": session.get("updated_at"),
        "product": session.get("product", "sentinel-v2"),
        "messages": messages,
        "traces": [
            {
                key: item.get(key)
                for key in ("type", "turn_id", "intent_id", "action_family", "duration_ms", "timestamp", "message")
                if key in item
            }
            for item in session.get("traces", [])
            if item.get("type") in safe_trace_types
        ],
    }
