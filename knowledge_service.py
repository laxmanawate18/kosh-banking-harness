"""Kosh bank-document search: SQLite FTS5 with BM25 ranking over data/bank_documents/*.md.

The index is a local file rebuilt from the markdown when the documents change (checked at startup), so every
instance, including each Cloud Run container, has its own copy and needs no database server.
"""

from __future__ import annotations

import hashlib
import os
import re
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

DOCS_DIR = Path(__file__).resolve().parent / "data" / "bank_documents"
DB_PATH = Path(os.getenv("SENTINEL_KB_DB_PATH") or (Path(__file__).resolve().parent / "data" / "bank_knowledge.sqlite3"))


def get_db_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    con.row_factory = sqlite3.Row
    return con


def init_db(con: Optional[sqlite3.Connection] = None) -> None:
    if con is not None:
        with con:
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS kb_meta (
                    key TEXT PRIMARY KEY,
                    value TEXT
                );
                """
            )
            con.execute(
                """
                CREATE VIRTUAL TABLE IF NOT EXISTS bank_knowledge USING fts5(
                    doc_id UNINDEXED,
                    doc_title,
                    section_title,
                    category,
                    content,
                    keywords,
                    tokenize = 'porter unicode61'
                );
                """
            )


def _compute_docs_hash() -> str:
    if not DOCS_DIR.exists():
        return ""
    hasher = hashlib.sha256()
    for file in sorted(DOCS_DIR.glob("*.md")):
        hasher.update(file.name.encode("utf-8"))
        hasher.update(file.read_bytes())
    return hasher.hexdigest()



def _chunk_markdown(file_path: Path) -> List[Dict[str, str]]:
    text = file_path.read_text(encoding="utf-8")
    lines = text.split("\n")
    doc_title = file_path.stem.replace("_", " ").title()
    category = "general"

    stem = file_path.stem.lower()
    if "charter" in stem or "governance" in stem:
        category = "charter"
    elif "saving" in stem or "deposit" in stem:
        category = "deposits"
    elif "card" in stem or "reward" in stem:
        category = "cards"
    elif "lend" in stem or "loan" in stem or "mortgage" in stem:
        category = "loans"
    elif "operation" in stem or "service" in stem:
        category = "operations"

    chunks: List[Dict[str, str]] = []
    current_section = doc_title
    current_lines: List[str] = []

    for line in lines:
        if line.startswith("# "):
            doc_title = line[2:].strip()
            current_section = doc_title
        elif line.startswith("## ") or line.startswith("### "):
            if current_lines:
                content = "\n".join(current_lines).strip()
                if len(content) > 30:
                    chunks.append({
                        "doc_title": doc_title,
                        "section_title": current_section,
                        "category": category,
                        "content": content,
                    })
                current_lines = []
            current_section = line.lstrip("#").strip()
        else:
            current_lines.append(line)

    if current_lines:
        content = "\n".join(current_lines).strip()
        if len(content) > 30:
            chunks.append({
                "doc_title": doc_title,
                "section_title": current_section,
                "category": category,
                "content": content,
            })

    return chunks


def ingest_documents(force: bool = False) -> int:
    """Ingest markdown files from data/bank_documents into the index."""
    con = get_db_connection()
    init_db(con)

    current_hash = _compute_docs_hash()
    if not force:
        cur = con.execute("SELECT value FROM kb_meta WHERE key = 'docs_hash'")
        row = cur.fetchone()
        if row and row["value"] == current_hash:
            count = con.execute("SELECT count(*) FROM bank_knowledge").fetchone()[0]
            if count > 0:
                con.close()
                return count

    all_chunks = []
    if DOCS_DIR.exists():
        for file in sorted(DOCS_DIR.glob("*.md")):
            all_chunks.extend(_chunk_markdown(file))

    with con:
        con.execute("DELETE FROM bank_knowledge;")
        for i, chunk in enumerate(all_chunks):
            doc_id = f"{chunk['category']}-{i+1}"
            words = set(re.findall(r"\b[a-zA-Z]{3,}\b", chunk["content"].lower()))
            keywords = " ".join(sorted(words)[:30])
            con.execute(
                """
                INSERT INTO bank_knowledge (doc_id, doc_title, section_title, category, content, keywords)
                VALUES (?, ?, ?, ?, ?, ?);
                """,
                (
                    doc_id,
                    chunk["doc_title"],
                    chunk["section_title"],
                    chunk["category"],
                    chunk["content"],
                    keywords,
                ),
            )
        con.execute(
            "INSERT OR REPLACE INTO kb_meta (key, value) VALUES ('docs_hash', ?);",
            (current_hash,),
        )

    con.close()
    return len(all_chunks)


def sanitize_query(query: str) -> str:
    """Extract alphanumerics into a safe FTS5 query string."""
    tokens = re.findall(r"[a-zA-Z0-9]+", query.strip())
    # Filter short stop words
    stop_words = {"the", "and", "for", "with", "this", "that", "what", "which", "are", "can", "how", "does", "our"}
    clean = [t for t in tokens if t.lower() not in stop_words]
    if not clean:
        clean = tokens
    return " OR ".join(clean)


def search_bank_knowledge(
    query: str,
    category: Optional[str] = None,
    limit: int = 4,
) -> List[Dict[str, Any]]:
    """Retrieve truth-grounded passages from Kosh Bank documents."""
    if not DB_PATH.exists():
        ingest_documents()

    con = get_db_connection()
    init_db(con)

    # Ensure documents are ingested
    count = con.execute("SELECT count(*) FROM bank_knowledge").fetchone()[0]
    if count == 0:
        ingest_documents(force=True)

    fts_query = sanitize_query(query)
    if not fts_query:
        con.close()
        return []

    sql = """
        SELECT
            doc_id,
            doc_title,
            section_title,
            category,
            content,
            snippet(bank_knowledge, 4, '«', '»', '...', 28) AS snippet,
            bm25(bank_knowledge) AS rank
        FROM bank_knowledge
        WHERE bank_knowledge MATCH ?
    """
    params: List[Any] = [fts_query]

    if category and category.strip().lower() not in ("", "all", "general"):
        sql += " AND category = ?"
        params.append(category.strip().lower())

    sql += " ORDER BY rank LIMIT ?"
    params.append(limit)

    try:
        cur = con.execute(sql, params)
        rows = cur.fetchall()
    except sqlite3.OperationalError:
        con.close()  # an FTS syntax the sanitiser did not catch: no passages rather than an error
        return []

    results = []
    for r in rows:
        results.append({
            "doc_id": r["doc_id"],
            "doc_title": r["doc_title"],
            "section_title": r["section_title"],
            "category": r["category"],
            "citation": f"{r['doc_title']} — {r['section_title']}",
            "snippet": r["snippet"],
            "content": r["content"],
            "score": round(abs(float(r["rank"])), 4),
        })

    con.close()
    return results


def query_bank_knowledge(query: str, category: str = "") -> dict:
    """Search Kosh Bank's official policy documents, product terms, fee schedules, regulatory charters, and FAQs. Call to provide truth-grounded answers with citations."""
    results = search_bank_knowledge(query, category=category or None, limit=3)
    return {
        "query": query,
        "category": category or "all",
        "results_count": len(results),
        "passages": results,
        "fact_source": "kosh_official_documentation_corpus",
    }


if __name__ == "__main__":
    count = ingest_documents(force=True)
    print(f"Successfully ingested {count} sections into {DB_PATH}")
    test_queries = [
        "penalty for premature fixed deposit withdrawal",
        "airport lounge access obsidian metal card",
        "positive pay system cheque limit",
        "DICGC deposit insurance protection limit",
    ]
    for q in test_queries:
        res = search_bank_knowledge(q, limit=2)
        print(f"\nQuery: {q}")
        for item in res:
            print(f"  [{item['citation']}] (Score: {item['score']}): {item['snippet']}")
