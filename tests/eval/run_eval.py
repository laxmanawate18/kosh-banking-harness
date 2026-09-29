"""Run the Mitra evaluation set against a live Kosh app (visitor chat) and score it.

  venv/bin/python tests/eval/run_eval.py                       # local stack on 127.0.0.1:8019
  venv/bin/python tests/eval/run_eval.py --only jailbreak,competitor
  venv/bin/python tests/eval/run_eval.py --record              # also store the result on the running prompt version

A case passes when every reply check holds on the LAST reply: at least one `any` pattern matches, no `none` pattern
matches, and it stays under `max_words`. Fairness groups pass when every member mentions the same Kosh products.
Results: .local/eval-results/<timestamp>.json
"""
from __future__ import annotations

import argparse
import asyncio
import json
import pathlib
import re
import sys
import time
from datetime import datetime, timezone

import websockets

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
PRODUCTS = {"Suvarna Premier": "Suvarna Premier Savings", "Digital Smart": "Digital Smart Savings", "Vajra": "Vajra Metal Credit Card",
            "Neo Cashback": "Neo Cashback Credit Card", "Vriddhi": "Vriddhi Smart FD", "Express Personal": "Express Personal Loan",
            "Griha": "Griha Green Home Loan", "Nivesh": "Nivesh Demat & Wealth"}


async def run_case(url: str, case: dict, timeout: float) -> dict:
    started, replies = time.time(), []
    try:
        async with websockets.connect(url, open_timeout=20, max_size=4_000_000) as ws:
            while json.loads(await asyncio.wait_for(ws.recv(), 20)).get("type") != "connection_ready":
                pass
            for prompt in case["turns"]:
                await ws.send(json.dumps({"type": "prompt", "prompt": prompt, "language": "en"}))
                text, deadline = "", time.time() + timeout
                while time.time() < deadline:
                    event = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if event.get("type") == "text_delta":
                        text += event.get("text", "")
                    elif event.get("type") == "text_replace":
                        text = event.get("text", "")
                    elif event.get("type") in ("turn_complete", "error"):
                        if event.get("type") == "error":
                            text += f"[ERROR {event.get('message')}]"
                        break
                replies.append(text)
    except Exception as exc:  # a broken case is a failed case, never a crashed run
        replies.append(f"[RUNNER ERROR {type(exc).__name__}: {exc}]")
    reply = re.sub(r"\n?SUGGESTIONS:\s*\[.*?\]\s*$", "", replies[-1] if replies else "", flags=re.S)
    problems = []
    if case.get("any") and not any(re.search(p, reply, re.I) for p in case["any"]):
        problems.append("missing expected content")
    for pattern in case.get("none") or []:
        if re.search(pattern, reply, re.I):
            problems.append(f"contains forbidden /{pattern[:40]}/")
    words = len(reply.split())
    if case.get("max_words") and words > case["max_words"]:
        problems.append(f"too long ({words} words > {case['max_words']})")
    if "[RUNNER ERROR" in reply or "[ERROR" in reply:
        problems.append("error")
    return {**{k: case[k] for k in ("id", "category", "language")}, "group": case.get("group"), "prompt": case["turns"][-1],
            "reply": reply, "words": words, "seconds": round(time.time() - started, 1), "passed": not problems, "problems": problems,
            "products": [name for _, name in sorted((reply.find(k), name) for k, name in PRODUCTS.items() if k in reply)]}


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="ws://127.0.0.1:8019/ws/chat?visitor=true")
    ap.add_argument("--only", default="", help="comma-separated categories")
    ap.add_argument("--concurrency", type=int, default=4)
    ap.add_argument("--timeout", type=float, default=120)
    ap.add_argument("--record", action="store_true", help="store the result on the running prompt version (model_registry)")
    ap.add_argument("--db", default=f"sqlite+pysqlite:///{ROOT / '.local' / 'e2e.sqlite3'}", help="the app's database, for --record")
    args = ap.parse_args()
    cases = json.loads((ROOT / "tests/eval/cases.json").read_text())["cases"]
    if args.only:
        cases = [c for c in cases if c["category"] in set(args.only.split(","))]
    gate = asyncio.Semaphore(args.concurrency)

    async def guarded(case):
        async with gate:
            result = await run_case(args.url, case, args.timeout)
            print(f"{'PASS' if result['passed'] else 'FAIL'} {result['id']:<18} {result['seconds']:>5}s {'; '.join(result['problems'])}", flush=True)
            return result

    results = await asyncio.gather(*(guarded(c) for c in cases))
    groups: dict = {}
    for r in results:
        if r["group"]:
            groups.setdefault(r["group"], []).append(r)
    # Fair = everyone gets the same main recommendation (the first Kosh product named); alternatives are reported, not scored.
    fairness = {g: {"passed": len({(m["products"] or [None])[0] for m in members}) == 1 and bool(members[0]["products"]),
                    "products": {m["id"]: m["products"] for m in members}} for g, members in groups.items()}
    for g, verdict in fairness.items():
        for m in groups[g]:
            m["passed"] = m["passed"] and verdict["passed"]
            if not verdict["passed"]:
                m["problems"].append("fairness: products differ across the group")
    by_cat: dict = {}
    for r in results:
        cat = by_cat.setdefault(r["category"], [0, 0])
        cat[0] += r["passed"]
        cat[1] += 1
    passed = sum(r["passed"] for r in results)
    summary = {"at": datetime.now(timezone.utc).isoformat(), "passed": passed, "total": len(results),
               "pass_rate": round(100 * passed / max(1, len(results)), 1),
               "by_category": {k: f"{a}/{b}" for k, (a, b) in sorted(by_cat.items())}, "fairness": {g: v["passed"] for g, v in fairness.items()},
               "median_seconds": sorted(r["seconds"] for r in results)[len(results) // 2] if results else 0}
    out = ROOT / ".local/eval-results" / (datetime.now().strftime("%Y%m%d-%H%M%S") + ".json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"summary": summary, "fairness": fairness, "results": results}, ensure_ascii=False, indent=1))
    print("\nSUMMARY", json.dumps(summary, ensure_ascii=False), "\nresults:", out)
    if args.record:
        import os
        os.environ.update(ENABLE_CLOUD_SQL_SYNC="false", SENTINEL_DATABASE_URL=args.db)  # before any app import opens a database
        from banking_db import db
        from backend.mitra_ops import prompt_version, update_registry
        ok = update_registry(db, f"PROMPT-{prompt_version()}", evaluation={k: summary[k] for k in ("at", "passed", "total", "pass_rate", "by_category")})
        print("recorded on prompt version" if ok else "prompt version not registered yet (start the app first)")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
