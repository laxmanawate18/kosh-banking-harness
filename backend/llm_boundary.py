"""The LLM boundary: what a model may see of bank data, and how real values still reach the customer.

Model view   Every tool declares in config/harness/tools.json ("model_view") which result fields a model may read.
             Anything not declared is dropped (deny by default). Amounts become placeholders such as {{amt_3}}: the
             server writes the real figure into the reply, so the model can say "your balance is {{amt_3}}" without
             ever seeing it. Outside agents (MCP) get no amounts at all.
UI view      The full result goes only to the customer's own screen (looked up by the "_ref" the model view carries).
Input        Identifiers a person types (PAN, Aadhaar, card, account number, IFSC, UPI id, email, mobile) are swapped for
             tags such as [PAN_1] before a model sees the text; tool arguments get the real value back on the server.
Safety net   Every payload bound for a model is checked for this customer's real identifiers and restricted patterns;
             anything found is replaced before it is sent, and the hit is audited.
"""

from __future__ import annotations

import functools
import itertools
import json
import re
from typing import Any, Callable, Dict, Iterable, List, Optional

from backend import harness

AMOUNT_WITHHELD = "[shown only in the Kosh app]"
UNKNOWN_PLACEHOLDER = "(see the details shown above)"

# Order matters: the specific shapes first, then the generic long digit runs.
_INPUT_PATTERNS = [
    ("PAN", re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b", re.I)),
    ("IFSC", re.compile(r"\b[A-Z]{4}0[A-Z0-9]{6}\b")),
    ("EMAIL", re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")),
    ("UPI", re.compile(r"\b[\w.-]{2,}@[a-zA-Z]{2,}\b")),
    ("AADHAAR", re.compile(r"(?<!\d)\d{4}[ -]?\d{4}[ -]?\d{4}(?!\d)")),
    ("CARD", re.compile(r"(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)")),
    ("MOBILE", re.compile(r"(?<![\d+])(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)")),
    ("ACCOUNT", re.compile(r"(?<!\d)\d{9,18}(?!\d)")),
]
# One-time codes are never needed by any tool, so they are dropped, not kept.
_CODE = re.compile(r"\b(otp|one[- ]time|code|pin|cvv|mpin)\b(\D{0,20}?)(\d{3,8})(?!\d)", re.I)
_TAG = re.compile(r"\[(PAN|IFSC|EMAIL|UPI|AADHAAR|CARD|MOBILE|ACCOUNT)_(\d+)\]")
_PLACEHOLDER = re.compile(r"\{\{\s*([a-z]+_\d+)\s*\}\}")
# Restricted shapes the safety net strips even when they are not this customer's: a full PAN or a 16-digit card number.
_RESTRICTED = [re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b"), re.compile(r"(?<!\d)\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{4}(?!\d)")]


def _mask(kind: str, value: str) -> str:
    """How a person's own identifier is shown back to them in a reply: enough to recognise, never the whole value."""
    if kind == "EMAIL":
        user, _, domain = value.partition("@")
        return user[:1] + "•••@" + domain
    if kind == "UPI":
        user, _, handle = value.partition("@")
        return user[:2] + "•••@" + handle
    digits = re.sub(r"[\s-]", "", value)
    return "•••• " + digits[-4:]


def _inr(minor: Any) -> str:
    from product_service import inr
    return inr(minor / 100, 2)


class Vault:
    """One chat's server-side store: placeholder values, typed identifiers and the full tool results for the screen."""

    def __init__(self, known: Iterable[str] = ()):
        self.values: Dict[str, str] = {}      # amt_3 -> "₹1,22,570.00"
        self.inputs: Dict[str, str] = {}      # [PAN_1] -> "ABCDE1234F"
        self.full: Dict[str, Any] = {}        # r7 -> the complete tool result
        self.known = sorted({k for k in known if isinstance(k, str) and len(k.strip()) >= 6}, key=len, reverse=True)
        self.hits: List[str] = []             # what the safety net replaced, for the audit
        self._ids = itertools.count(1)

    # One live store per chat. The SDK deep-copies agent configs (hooks included); a copy would miss later entries.
    def __deepcopy__(self, memo: Dict[int, Any]) -> "Vault":
        return self

    def __copy__(self) -> "Vault":
        return self

    # ---- placeholders ---------------------------------------------------------------------------------------
    def amount(self, minor: Any) -> str:
        key = f"amt_{next(self._ids)}"
        self.values[key] = _inr(minor)
        return "{{" + key + "}}"

    def fill(self, text: str) -> str:
        """The reply as the customer sees it: placeholders become figures, tags become their masked form."""
        if not text:
            return text
        text = _PLACEHOLDER.sub(lambda m: self.values.get(m[1], UNKNOWN_PLACEHOLDER), text)
        return _TAG.sub(lambda m: _mask(m[1], self.inputs[m[0]]) if m[0] in self.inputs else m[0], text)

    # ---- typed identifiers --------------------------------------------------------------------------------
    def redact(self, text: str) -> str:
        """Text a person typed, with identifiers swapped for tags (kept here so tools get the real value)."""
        if not text:
            return text
        text = _CODE.sub(lambda m: f"{m[1]}{m[2]}[CODE]", text)
        reverse = {v: k for k, v in self.inputs.items()}
        for kind, pattern in _INPUT_PATTERNS:
            def tag(m: re.Match, kind: str = kind) -> str:
                value = m[0].strip()
                if value not in reverse:
                    reverse[value] = f"[{kind}_{next(self._ids)}]"
                    self.inputs[reverse[value]] = value
                return reverse[value]
            text = pattern.sub(tag, text)
        return text

    def resolve(self, value: Any) -> Any:
        """Tool arguments with tags put back to the real values (server side, after the model chose them)."""
        if isinstance(value, str):
            return _TAG.sub(lambda m: self.inputs.get(m[0], m[0]), value)
        if isinstance(value, dict):
            return {k: self.resolve(v) for k, v in value.items()}
        if isinstance(value, list):
            return [self.resolve(v) for v in value]
        return value

    # ---- the safety net -------------------------------------------------------------------------------------
    def guard(self, text: str) -> str:
        """Model-bound text with this customer's real identifiers and restricted shapes replaced. Records each hit."""
        if not text:
            return text
        for value in self.known:
            if value in text:
                self.hits.append("known identifier")
                text = text.replace(value, "[withheld]")
        for pattern in _RESTRICTED:
            text, n = pattern.subn("[withheld]", text)
            if n:
                self.hits.append(pattern.pattern[:20])
        return text

    def guard_value(self, value: Any) -> Any:
        if isinstance(value, str):
            return self.guard(value)
        if isinstance(value, dict):
            return {k: self.guard_value(v) for k, v in value.items()}
        if isinstance(value, list):
            return [self.guard_value(v) for v in value]
        return value

    # ---- tool results ---------------------------------------------------------------------------------------
    def model_view(self, channel: str, tool: str, result: Any, *, amounts: str = "placeholder") -> Any:
        """What the model may read of one tool result. The full result stays here, under the returned "_ref"."""
        spec = (harness.tool_spec(channel, tool) or {}).get("model_view")
        if spec is None:  # deny by default: an undeclared view shows nothing
            view: Any = {"note": "Result shown to the customer on screen."}
        elif spec == "public":
            view = result
        else:
            view = project(result, spec, lambda minor: self.amount(minor) if amounts == "placeholder" else AMOUNT_WITHHELD)
        view = self.guard_value(view)
        if isinstance(view, dict):
            ref = f"r{next(self._ids)}"
            self.full[ref] = result
            view = {**view, "_ref": ref}
        return view

    def screen(self, result: Any) -> Any:
        """The full result for the customer's screen, given what the model saw (or the result itself)."""
        if isinstance(result, str):
            try:
                result = json.loads(result)
            except ValueError:
                return result
        if isinstance(result, dict) and result.get("_ref") in self.full:
            return self.full[result["_ref"]]
        return result


def project(value: Any, spec: Dict[str, List[str]], amount: Callable[[Any], str]) -> Any:
    """Copy only the declared paths of `value`. Paths: "a.b", "items[].name"; "amounts" paths become placeholders."""
    out: Dict[str, Any] = {}
    for path in spec.get("fields", []):
        _copy(value, path.split("."), out, None)
    for path in spec.get("amounts", []):
        _copy(value, path.split("."), out, amount)
    return out


def _copy(src: Any, parts: List[str], dst: Dict[str, Any], amount: Optional[Callable[[Any], str]]) -> None:
    head, rest = parts[0], parts[1:]
    is_list = head.endswith("[]")
    key = head[:-2] if is_list else head
    if not isinstance(src, dict) or key not in src:
        return
    item = src[key]
    if is_list:
        if not isinstance(item, list):
            return
        target = dst.setdefault(key, [{} for _ in item])
        for one, slot in zip(item, target):
            if rest:
                _copy(one, rest, slot, amount)
        return
    if rest:
        _copy(item, rest, dst.setdefault(key, {}), amount)
    elif amount is not None and isinstance(item, (int, float)) and not isinstance(item, bool):
        dst[key] = amount(item)
    elif amount is None:
        dst[key] = item


def guarded_tools(tools: Iterable[Callable[..., Any]], channel: str, vault: Vault, *,
                  amounts: str = "placeholder") -> List[Callable[..., Any]]:
    """The tools as a model may use them: arguments resolved on the way in, results reduced to the model view."""
    def guard(fn: Callable[..., Any]) -> Callable[..., Any]:
        @functools.wraps(fn)  # the model's schema is still the real tool's signature and description
        def call(*args: Any, **kwargs: Any) -> Any:
            return vault.model_view(channel, fn.__name__, fn(*args, **vault.resolve(kwargs)), amounts=amounts)
        return call
    return [guard(t) for t in tools]


def audit_hits(vault: Vault, db, *, session_id: Optional[str], customer_id: Optional[str]) -> None:
    """Record what the safety net replaced on its way to a model (never the values themselves)."""
    if not vault.hits:
        return
    hits, vault.hits = vault.hits, []
    db.append_audit("LLM_BOUNDARY_WITHHELD", session_id=session_id, customer_id=customer_id, actor="system", severity="WARNING",
                    summary=f"Withheld {len(hits)} restricted value(s) from a model-bound payload",
                    details={"count": len(hits), "kinds": sorted(set(hits))})


def known_identifiers(db, customer_id: Optional[str]) -> List[str]:
    """This customer's real identifiers, which must never reach a model in any form."""
    if not customer_id:
        return []
    snapshot = db.snapshot()
    customer = (snapshot.get("customers") or {}).get(customer_id) or {}
    kyc = db.get_kyc_profile(customer_id) or {}
    values = [customer.get("email"), kyc.get("address"), kyc.get("date_of_birth"), kyc.get("pan_number"), kyc.get("aadhaar_number")]
    values += [a.get(k) for a in (snapshot.get("accounts") or {}).values() if a.get("customer_id") == customer_id
               for k in ("account_number", "cif_number")]
    values += [b.get("upi_id") for b in (snapshot.get("beneficiaries") or {}).values() if b.get("customer_id") == customer_id]
    return [v for v in values if isinstance(v, str)]
