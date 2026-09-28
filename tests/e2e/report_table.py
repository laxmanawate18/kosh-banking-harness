"""Render the pass-1 vs pass-2 E2E comparison table for KOSH_TEST_REPORT.md from results.json files."""
import json
import sys

MARK = {"PASS": "✅ Pass", "FAIL": "❌ Fail", "BLOCKED": "⛔ Blocked", None: "—"}


def load(path):
    return {item["id"]: item for item in json.load(open(path))}


def main(run1, run2):
    r1, r2 = load(run1), load(run2)
    ids = sorted(set(r1) | set(r2), key=lambda i: (i[0], len(i), i))
    area = None
    for cid in ids:
        item = r2.get(cid) or r1.get(cid)
        if item["area"] != area:
            area = item["area"]
            print(f"\n**{area}**\n")
            print("| ID | Check | Pass 1 | Pass 2 |")
            print("|---|---|---|---|")
        s1 = (r1.get(cid) or {}).get("status")
        s2 = (r2.get(cid) or {}).get("status")
        note = " (new check)" if cid not in r1 else ""
        print(f"| {cid} | {item['title']}{note} | {MARK[s1]} | {MARK[s2]} |")
    for name, r in (("Pass 1", r1), ("Pass 2", r2)):
        counts = {}
        for item in r.values():
            counts[item["status"]] = counts.get(item["status"], 0) + 1
        print(f"\n{name}: {len(r)} checks — " + ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
