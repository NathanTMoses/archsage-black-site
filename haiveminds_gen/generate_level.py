"""
Breadth-first expansion for levels 1 through 4 -- CONCURRENT version.

For the given --level N, queries the DB for all nodes at level N-1 that have not
had children generated yet, then fires up to CONCURRENCY API calls *at the same
time* (bounded by an asyncio.Semaphore) to generate each parent's 14 children at
level N. All SQLite writes happen on the single event-loop thread as each task
completes, so there is no multi-writer locking to worry about.

Safe to re-run / interrupt: parents are marked `children_done` only after their
children are committed, so a re-run simply picks up where it left off.

Usage:
    python -m haiveminds_gen.generate_level --level 1
    python -m haiveminds_gen.generate_level --level 2 --concurrency 500
    python -m haiveminds_gen.generate_level --level 3
    python -m haiveminds_gen.generate_level --level 4
"""
import argparse
import asyncio
import time

from .config import BRANCHING_FACTOR, CONCURRENCY, BATCH_PROGRESS_EVERY, LEVEL_SIZES
from .db import init_db, get_unprocessed_parents, insert_children, get_level_count
from .generate_helpers import generate_valid_children_async


async def _process_parent(sem: asyncio.Semaphore, level: int, parent_id: int, parent_message: str,
                           counters: dict):
    async with sem:
        try:
            children = await generate_valid_children_async(parent_id, parent_message, BRANCHING_FACTOR)
        except Exception as exc:  # noqa: BLE001
            counters["failed"] += 1
            print(f"  ! parent {parent_id} failed permanently: {exc!r}")
            return

    # Back on the (single-threaded) event loop -- safe to write to SQLite here.
    insert_children(parent_id, level, children)
    counters["done"] += 1
    if counters["done"] % BATCH_PROGRESS_EVERY == 0:
        print(f"  [{counters['done'] + counters['failed']}/{counters['total']}] "
              f"processed | level {level} total so far: {get_level_count(level)}")


async def run_level_async(level: int, concurrency: int):
    parent_level = level - 1
    expected_total = LEVEL_SIZES.get(level)

    parents = get_unprocessed_parents(parent_level)
    if not parents:
        done = get_level_count(level)
        print(f"Level {level}: nothing to do. {done} nodes already present"
              f"{f' (expected {expected_total})' if expected_total else ''}.")
        return

    print(f"Level {level}: expanding {len(parents)} parent(s) from level {parent_level} "
          f"x{BRANCHING_FACTOR} children each, up to {concurrency} concurrent request(s)...")

    sem = asyncio.Semaphore(concurrency)
    counters = {"done": 0, "failed": 0, "total": len(parents)}
    started_at = time.monotonic()

    tasks = [
        _process_parent(sem, level, parent_id, parent_message, counters)
        for parent_id, parent_message in parents
    ]
    await asyncio.gather(*tasks)

    elapsed = time.monotonic() - started_at
    print(f"Level {level} complete in {elapsed:.1f}s: {get_level_count(level)} nodes "
          f"({counters['failed']} parent(s) failed permanently and can be retried by re-running this command).")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--level", type=int, required=True, choices=[1, 2, 3, 4])
    parser.add_argument("--concurrency", type=int, default=CONCURRENCY)
    args = parser.parse_args()

    init_db()
    asyncio.run(run_level_async(args.level, args.concurrency))


if __name__ == "__main__":
    main()
