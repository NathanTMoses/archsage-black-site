"""
Level 0 (root) generation.

Run once:
    python -m haiveminds_gen.generate_root
"""
from .db import init_db, root_exists, insert_root
from .prompts import build_root_prompt
from .gemini_client import call_gemini_for_messages
from .validate import validate_message


def main():
    init_db()

    if root_exists():
        print("Root node already exists, skipping generation.")
        return

    prompt = build_root_prompt()
    for attempt in range(1, 6):
        candidates = call_gemini_for_messages(prompt)
        if candidates:
            message = candidates[0].strip()
            ok, reason = validate_message(message)
            if ok:
                node_id = insert_root(message)
                print(f"Inserted root node id={node_id}: {message!r}")
                return
            print(f"Attempt {attempt}: root candidate rejected ({reason}): {message!r}")

    raise RuntimeError("Failed to generate a valid root message after 5 attempts.")


if __name__ == "__main__":
    main()
