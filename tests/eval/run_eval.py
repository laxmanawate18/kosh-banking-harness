"""Run the Mitra evaluation set against a live Kosh app (visitor chat) and score it.

  venv/bin/python tests/eval/run_eval.py                       # local stack on 127.0.0.1:8019
  venv/bin/python tests/eval/run_eval.py --only jailbreak,competitor
  venv/bin/python tests/eval/run_eval.py --record              # also store the result on the running prompt version
  venv/bin/python tests/eval/run_eval.py --retry .local/eval-results/<run>.json --record
                                                               # re-run only that run's failures (e.g. model timeouts), merge, score

Cases with "channel": "customer" run signed in as the demo customer (--customer), in a fresh chat each; cases with
"channel": "officer" ask the officer copilot as --officer.
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


def _ask_copilot(base: str, session: tuple, message: str, history: list, timeout: float) -> str:
    import urllib.error
    import urllib.request
    cookie, csrf = session
    req = urllib.request.Request(base + "/api/officer/copilot", method="POST",
                                 data=json.dumps({"message": message, "history": history}).encode(),
                                 headers={"Content-Type": "application/json", "X-CSRF-Token": csrf, "Cookie": f"sentinel_session={cookie}"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return json.loads(response.read())["reply"]
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and attempt < 3:  # the per-officer rate limit is working; wait for the next minute
                time.sleep(30)
                continue
            return f"[ERROR {exc.code} {exc.read()[:200]!r}]"
    return "[ERROR rate limited]"


async def run_case(url: str, case: dict, timeout: float, cookie: str | None = None, officer: tuple | None = None) -> dict:
    started, replies = time.time(), []
    customer = case.get("channel") == "customer"
    if customer:
        url = url.split("?", 1)[0]
    if case.get("channel") == "officer":  # the officer copilot, over its REST endpoint, multi-turn through history
        base = url.replace("ws://", "http://").replace("wss://", "https://").split("/ws/")[0]
        history: list = []
        try:
            for prompt in case["turns"]:
                reply = await asyncio.to_thread(_ask_copilot, base, officer, prompt, history, timeout)
                history += [{"role": "officer", "text": prompt}, {"role": "copilot", "text": reply}]
                replies.append(reply)
        except Exception as exc:
            replies.append(f"[RUNNER ERROR {type(exc).__name__}: {exc}]")
        return _score(case, replies, started)
    try:
        async with websockets.connect(url, open_timeout=20, max_size=4_000_000,
                                      additional_headers={"Cookie": f"sentinel_session={cookie}"} if customer else None) as ws:
            while json.loads(await asyncio.wait_for(ws.recv(), 20)).get("type") != "connection_ready":
                pass
            for prompt in case["turns"]:
                for attempt in range(4):
                    await ws.send(json.dumps({"type": "prompt", "prompt": prompt, "language": "en"}))
                    text, deadline, limited = "", time.time() + timeout, False
                    while time.time() < deadline:
                        event = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                        if event.get("type") == "text_delta":
                            text += event.get("text", "")
                        elif event.get("type") == "text_replace":
                            text = event.get("text", "")
                        elif event.get("type") in ("turn_complete", "error"):
                            if event.get("type") == "error":
                                limited = "quickly" in str(event.get("message"))
                                text += f"[ERROR {event.get('message')}]"
                            break
                    if not limited or attempt == 3:
                        break
                    await asyncio.sleep(30)  # the per-user rate limit is working; wait for the next minute
                replies.append(text)
    except Exception as exc:  # a broken case is a failed case, never a crashed run
        replies.append(f"[RUNNER ERROR {type(exc).__name__}: {exc}]")
    return _score(case, replies, started)


def _score(case: dict, replies: list, started: float) -> dict:
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
    return {**{k: case[k] for k in ("id", "category", "language")}, "channel": case.get("channel", "visitor"), "group": case.get("group"), "prompt": case["turns"][-1],
            "reply": reply, "words": words, "seconds": round(time.time() - started, 1), "passed": not problems, "problems": problems,
            "products": [name for _, name in sorted((reply.find(k), name) for k, name in PRODUCTS.items() if k in reply)]}


def officer_session(args) -> tuple:
    """A signed-in officer session (cookie, CSRF token) in the app's own database, for officer copilot cases."""
    import os
    os.environ.update(ENABLE_CLOUD_SQL_SYNC="false", SENTINEL_DATABASE_URL=args.db)
    from auth_service import AuthService
    from banking_db import db
    _, cookie, csrf = AuthService(db.runtime).create_direct_session(args.officer)
    return cookie, csrf


def customer_session(args) -> str:
    """A signed-in session for the demo customer in the app's own database, with banking consent recorded."""
    import os
    import urllib.request
    os.environ.update(ENABLE_CLOUD_SQL_SYNC="false", SENTINEL_DATABASE_URL=args.db)  # before any app import opens a database
    from auth_service import AuthService
    from banking_db import db
    _, cookie, csrf = AuthService(db.runtime).create_direct_session(args.customer)
    base = args.url.replace("ws://", "http://").replace("wss://", "https://").split("/ws/")[0]
    req = urllib.request.Request(base + "/api/consent", data=b'{"accepted": true}', method="POST",
                                 headers={"Content-Type": "application/json", "X-CSRF-Token": csrf, "Cookie": f"sentinel_session={cookie}"})
    urllib.request.urlopen(req, timeout=20).read()
    return cookie


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="ws://127.0.0.1:8019/ws/chat?visitor=true")
    ap.add_argument("--only", default="", help="comma-separated categories")
    ap.add_argument("--concurrency", type=int, default=4)
    ap.add_argument("--timeout", type=float, default=120)
    ap.add_argument("--record", action="store_true", help="store the result on the running prompt version (model_registry)")
    ap.add_argument("--backup", default="", metavar="MODEL",
                    help="this run evaluated the backup model (app started with MITRA_FORCE_BACKUP=1); recorded as its clearance")
    ap.add_argument("--db", default=f"sqlite+pysqlite:///{ROOT / '.local' / 'e2e.sqlite3'}", help="the app's database (customer session, --record)")
    ap.add_argument("--retry", default="", metavar="RESULTS_JSON",
                    help="re-run only the failed cases of this results file (and their whole fairness group); the merged run "
                         "is scored and recorded with the retried case ids listed")
    ap.add_argument("--customer", default="aarav", help="demo customer the signed-in cases run as")
    ap.add_argument("--officer", default="officer.mumbai", help="officer the copilot cases run as")
    args = ap.parse_args()
    cases = json.loads((ROOT / "tests/eval/cases.json").read_text())["cases"]
    if args.only:
        cases = [c for c in cases if c["category"] in set(args.only.split(","))]
    previous: list = []
    if args.retry:  # same prompt version, same cases: only the failures run again; every other result is kept as it was
        previous = json.loads(pathlib.Path(args.retry).read_text())["results"]
        failed = {r["id"] for r in previous if not r["passed"]}
        groups = {r["group"] for r in previous if r["id"] in failed and r.get("group")}
        cases = [c for c in cases if c["id"] in failed or (c.get("group") and c.get("group") in groups)]
        print(f"retrying {len(cases)} case(s): {', '.join(c['id'] for c in cases)}", flush=True)
    gate = asyncio.Semaphore(args.concurrency)
    async def guarded(case):
        async with gate:
            # A fresh signed-in session per customer case: sessions expire after 10 minutes idle.
            cookie = customer_session(args) if case.get("channel") == "customer" else None
            officer = officer_session(args) if case.get("channel") == "officer" else None
            result = await run_case(args.url, case, args.timeout, cookie, officer)
            print(f"{'PASS' if result['passed'] else 'FAIL'} {result['id']:<18} {result['seconds']:>5}s {'; '.join(result['problems'])}", flush=True)
            return result

    results = await asyncio.gather(*(guarded(c) for c in cases))
    retried = [r["id"] for r in results] if args.retry else []
    if args.retry:
        fresh = {r["id"]: r for r in results}
        results = [fresh.get(r["id"], r) for r in previous]
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
    if args.retry:
        summary.update(retried=retried, retried_from=pathlib.Path(args.retry).name)
    out = ROOT / ".local/eval-results" / (datetime.now().strftime("%Y%m%d-%H%M%S") + ".json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"summary": summary, "fairness": fairness, "results": results}, ensure_ascii=False, indent=1))
    print("\nSUMMARY", json.dumps(summary, ensure_ascii=False), "\nresults:", out)
    sys.path.insert(0, str(ROOT))
    from backend.mitra_ops import release_gate
    failures = release_gate(summary)
    summary["gate_failures"] = failures
    print("RELEASE GATE:", "PASS" if not failures else "FAIL - " + "; ".join(failures))
    if args.record:
        import os
        os.environ.update(ENABLE_CLOUD_SQL_SYNC="false", SENTINEL_DATABASE_URL=args.db)  # before any app import opens a database
        from banking_db import db
        from backend.mitra_ops import registry, update_registry  # noqa: E402
        # The version the app under test is running (the one active row), never one computed here: this process may not
        # share the app's settings or code.
        running = next((v["id"] for v in registry(db) if v["active"]), None)
        ok = running and update_registry(db, running, evaluation={k: summary[k] for k in (
            "at", "passed", "total", "pass_rate", "by_category", "fairness", "gate_failures", "retried", "retried_from")
            if k in summary}, backup_model=args.backup or None)
        print(f"recorded on {running}" + (f" as the evaluation of backup model {args.backup}" if args.backup else "")
              if ok else "no running prompt version registered (start the app first)")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
