#!/usr/bin/env python3
"""Validate the banking ontology folder.

Checks
  1. Every .md file has front matter with id, type, name, version, status.
  2. Every relative Markdown link points to an existing file, and to an existing anchor if one is given.
  3. Every id used in front matter lists (proc., act., obj., actor., pol., evt.) is defined somewhere.
  4. Every activity is used by at least one process, and every process appears in routing.md.

Usage:  python tools/validate_ontology.py [path-to-ontology-root]
Exit code 0 = clean, 1 = errors found.
"""
import os
import re
import sys

root = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
REQUIRED = ["id", "type", "name", "version", "status"]
ID_RE = re.compile(r"\b(proc|act|obj|actor|pol|evt)\.[a-z0-9_]+\b")
LINK_RE = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")
ANCHOR_RE = re.compile(r'<a id="([^"]+)"></a>')

errors, warnings = [], []
files = []
for dp, _, fn in os.walk(root):
    for n in fn:
        if n.endswith(".md"):
            files.append(os.path.join(dp, n))

defined, anchors, fm_of = set(), {}, {}


def front_matter(text):
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---", 4)
    if end < 0:
        return None
    fm = {}
    for line in text[4:end].split("\n"):
        if ":" in line:
            k, v = line.split(":", 1)
            fm[k.strip()] = v.strip()
    return fm


for p in files:
    rel = os.path.relpath(p, root)
    text = open(p, encoding="utf-8").read()
    fm = front_matter(text)
    if fm is None:
        errors.append(f"{rel}: missing front matter")
        continue
    fm_of[rel] = fm
    for k in REQUIRED:
        if k not in fm or not fm[k]:
            errors.append(f"{rel}: front matter missing '{k}'")
    if fm.get("id"):
        defined.add(fm["id"])
    a = set(ANCHOR_RE.findall(text))
    defined.update(a)
    anchors[rel] = a

for p in files:
    rel = os.path.relpath(p, root)
    text = open(p, encoding="utf-8").read()
    in_code = False
    for ln_no, line in enumerate(text.split("\n"), 1):
        if line.startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        for target in LINK_RE.findall(line):
            if target.startswith(("http://", "https://", "mailto:")):
                continue
            path, _, frag = target.partition("#")
            if path == "":
                tgt_rel = rel
            else:
                tgt = os.path.normpath(os.path.join(os.path.dirname(p), path))
                if not os.path.exists(tgt):
                    errors.append(f"{rel}:{ln_no}: broken link -> {target}")
                    continue
                tgt_rel = os.path.relpath(tgt, root)
            if frag and frag not in anchors.get(tgt_rel, set()):
                # also allow heading slugs
                errors.append(f"{rel}:{ln_no}: missing anchor '{frag}' in {tgt_rel}")

for rel, fm in fm_of.items():
    for k, v in fm.items():
        if v.startswith("["):
            for m in ID_RE.finditer(v):
                if m.group(0) not in defined:
                    errors.append(f"{rel}: front matter '{k}' references undefined id {m.group(0)}")
        elif k in ("performed_by", "approval_gate") and ID_RE.fullmatch(v) and v not in defined:
            errors.append(f"{rel}: front matter '{k}' references undefined id {v}")

procs = {fm["id"]: rel for rel, fm in fm_of.items() if fm.get("type") == "process"}
acts = {fm["id"] for rel, fm in fm_of.items() if fm.get("type") == "activity"}
used = set()
for rel, fm in fm_of.items():
    if fm.get("type") == "process":
        used.update(re.findall(r"act\.[a-z0-9_]+", fm.get("uses_activities", "")))
for a in sorted(acts - used):
    warnings.append(f"activity {a} is not used by any process")
routing = open(os.path.join(root, "routing.md"), encoding="utf-8").read() if os.path.exists(os.path.join(root, "routing.md")) else ""
for pid, rel in procs.items():
    if os.path.basename(rel) not in routing:
        errors.append(f"{pid} is not listed in routing.md")

print(f"Checked {len(files)} files, {len(defined)} defined ids.")
for w in warnings:
    print("WARNING:", w)
for e in errors:
    print("ERROR:", e)
print("RESULT:", "FAIL" if errors else "OK", f"({len(errors)} errors, {len(warnings)} warnings)")
sys.exit(1 if errors else 0)
