"""
Reconstructs the nested JSON tree from the completed SQLite database and writes
it to disk in chunks (one file per level-1 branch) instead of one giant file.

Usage:
    python -m haiveminds_gen.reconstruct_tree --out-dir output
"""
import argparse
import json
import os

from .db import get_conn


def load_children_map() -> dict:
    """Loads the whole table once and groups children by parent_id in memory."""
    children_map: dict = {}
    with get_conn() as conn:
        rows = conn.execute("SELECT id, parent_id, message FROM nodes ORDER BY id;").fetchall()
    node_by_id = {}
    for node_id, parent_id, message in rows:
        node_by_id[node_id] = {"id": node_id, "parent_id": parent_id, "message": message, "children": []}
        children_map.setdefault(parent_id, []).append(node_id)
    return node_by_id, children_map


def build_subtree(node_id: int, node_by_id: dict, children_map: dict) -> dict:
    node = node_by_id[node_id]
    for child_id in children_map.get(node_id, []):
        node["children"].append(build_subtree(child_id, node_by_id, children_map))
    return node


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", default="output")
    args = parser.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    node_by_id, children_map = load_children_map()

    root_ids = children_map.get(None, [])
    if not root_ids:
        print("No root node found in the database.")
        return
    root_id = root_ids[0]

    level1_ids = children_map.get(root_id, [])
    root_meta = {"id": root_id, "parent_id": None, "message": node_by_id[root_id]["message"]}

    with open(os.path.join(args.out_dir, "_root.json"), "w", encoding="utf-8") as f:
        json.dump(root_meta, f, ensure_ascii=False, indent=2)

    for branch_index, level1_id in enumerate(level1_ids, 1):
        subtree = build_subtree(level1_id, node_by_id, children_map)
        chunk_path = os.path.join(args.out_dir, f"branch_{branch_index:02d}_node{level1_id}.json")
        with open(chunk_path, "w", encoding="utf-8") as f:
            json.dump(subtree, f, ensure_ascii=False, indent=2)
        print(f"Wrote {chunk_path}")

    print(f"Done. {len(level1_ids)} branch chunk(s) + 1 root file written to {args.out_dir}/")


if __name__ == "__main__":
    main()
