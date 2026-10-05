"""Kosh banking harness: the declared tool registry (config/harness/tools.json) and the checks every agent call passes.

A tool call is allowed only if the tool is declared for the channel, the caller holds the tool's OAuth scopes, and every
argument is declared and matches its type and limits. What a tool may *do* (approval, limits) is enforced again by
Sentinel and the officer queue; this layer stops undeclared capabilities and malformed input before any code runs.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

REGISTRY_PATH = Path(__file__).resolve().parent.parent / "config" / "harness" / "tools.json"


@lru_cache(maxsize=1)
def registry() -> Dict[str, Any]:
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def tools(channel: str) -> Dict[str, Dict[str, Any]]:
    return registry()["channels"][channel]


def tool_spec(channel: str, name: str) -> Optional[Dict[str, Any]]:
    return tools(channel).get(name)


def _value_problem(spec: Dict[str, Any], value: Any, path: str) -> Optional[str]:
    kind = spec["type"]
    if kind == "string":
        if not isinstance(value, str):
            return f"{path} must be text"
        if len(value) > spec.get("max_length", 10_000):
            return f"{path} is longer than {spec['max_length']} characters"
        if "pattern" in spec and not re.fullmatch(spec["pattern"], value):
            return f"{path} has an invalid format"
        if "enum" in spec and value not in spec["enum"]:
            return f"{path} must be one of {spec['enum']}"
        return None
    if kind in {"integer", "number"}:
        # Models sometimes send 10.0 for 10; an integral float is accepted, a fractional one is not.
        if isinstance(value, bool) or not isinstance(value, (int, float)) or (kind == "integer" and value != int(value)):
            return f"{path} must be a{'n integer' if kind == 'integer' else ' number'}"
        if value < spec.get("min", float("-inf")) or value > spec.get("max", float("inf")):
            return f"{path} must be between {spec.get('min')} and {spec.get('max')}"
        return None
    if kind == "array":
        if not isinstance(value, list):
            return f"{path} must be a list"
        if len(value) > spec.get("max_items", 100):
            return f"{path} has more than {spec['max_items']} items"
        return next((p for i, item in enumerate(value) if (p := _value_problem(spec["items"], item, f"{path}[{i}]"))), None)
    if kind == "object":
        if not isinstance(value, dict):
            return f"{path} must be an object"
        if len(value) > spec.get("max_items", 100):
            return f"{path} has more than {spec['max_items']} entries"
        return next((p for k, v in value.items() if (p := _value_problem(spec["values"], v, f"{path}.{k}"))), None)
    return f"{path} has an undeclared type"


def check_call(channel: str, name: str, args: Dict[str, Any], scopes: Optional[Iterable[str]] = None) -> Optional[str]:
    """Why this call must be refused, or None when it matches the registry."""
    spec = tool_spec(channel, name)
    if spec is None:
        return f"{name} is not a registered {channel} capability"
    if scopes is not None and not set(spec["scopes"]).issubset(set(scopes)):
        return f"{name} needs scope {', '.join(spec['scopes'])}"
    unknown = sorted(set(args) - set(spec["args"]))
    if unknown:
        return f"unexpected fields {unknown}"
    for arg, arg_spec in spec["args"].items():
        value = args.get(arg)
        if value is None or value == "":
            if arg_spec.get("required"):
                return f"{arg} is required"
            continue
        if problem := _value_problem(arg_spec, value, arg):
            return problem
    return None


POLICY_PATH = REGISTRY_PATH.parent / "policy.json"


@lru_cache(maxsize=1)
def policy() -> Dict[str, Any]:
    return json.loads(POLICY_PATH.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def policy_version() -> str:
    """The reviewed version plus a hash of the file, so an unreviewed edit still shows on every decision."""
    import hashlib
    return f"{policy()['version']}+{hashlib.sha256(POLICY_PATH.read_bytes()).hexdigest()[:8]}"
