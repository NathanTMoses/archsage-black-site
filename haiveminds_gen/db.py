"""
SQLite persistence layer.

Schema note: the spec asked for a minimal 3-column table (id, parent_id, message).
Two extra bookkeeping columns are added -- `level` and `children_done` -- because
without them the breadth-first loop cannot cheaply find "all nodes in the previous
level" or resume after an interruption without re-scanning/re-generating everything.
They do not change the exported id/parent_id/message contract at all.
"""
import sqlite3
from contextlib import contextmanager
from .config import DB_PATH


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS nodes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                parent_id INTEGER REFERENCES nodes(id),
                level INTEGER NOT NULL,
                message TEXT NOT NULL,
                children_done INTEGER NOT NULL DEFAULT 0
            );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_nodes_level ON nodes(level);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_nodes_children_done ON nodes(level, children_done);")


def root_exists() -> bool:
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM nodes WHERE level = 0 LIMIT 1;").fetchone()
        return row is not None


def insert_root(message: str) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO nodes (parent_id, level, message, children_done) VALUES (NULL, 0, ?, 0);",
            (message,),
        )
        return cur.lastrowid


def get_unprocessed_parents(level: int, limit: int | None = None):
    """Parents at `level` whose children (level+1) have not been generated yet."""
    sql = "SELECT id, message FROM nodes WHERE level = ? AND children_done = 0 ORDER BY id;"
    params = [level]
    if limit is not None:
        sql = "SELECT id, message FROM nodes WHERE level = ? AND children_done = 0 ORDER BY id LIMIT ?;"
        params.append(limit)
    with get_conn() as conn:
        return conn.execute(sql, params).fetchall()


def get_level_count(level: int) -> int:
    with get_conn() as conn:
        row = conn.execute("SELECT COUNT(*) FROM nodes WHERE level = ?;", (level,)).fetchone()
        return row[0]


def insert_children(parent_id: int, level: int, messages: list[str]) -> list[int]:
    with get_conn() as conn:
        ids = []
        for msg in messages:
            cur = conn.execute(
                "INSERT INTO nodes (parent_id, level, message, children_done) VALUES (?, ?, ?, 0);",
                (parent_id, level, msg),
            )
            ids.append(cur.lastrowid)
        conn.execute("UPDATE nodes SET children_done = 1 WHERE id = ?;", (parent_id,))
        return ids


def mark_parent_done(parent_id: int):
    with get_conn() as conn:
        conn.execute("UPDATE nodes SET children_done = 1 WHERE id = ?;", (parent_id,))


def total_count() -> int:
    with get_conn() as conn:
        row = conn.execute("SELECT COUNT(*) FROM nodes;").fetchone()
        return row[0]


def counts_by_level() -> dict:
    with get_conn() as conn:
        rows = conn.execute("SELECT level, COUNT(*) FROM nodes GROUP BY level ORDER BY level;").fetchall()
        return {level: count for level, count in rows}


def get_children(parent_id):
    with get_conn() as conn:
        return conn.execute(
            "SELECT id, message FROM nodes WHERE parent_id IS ? ORDER BY id;", (parent_id,)
        ).fetchall()
