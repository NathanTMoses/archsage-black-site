"""
Level 5 remainder generation -- CONCURRENT version.

Expands the first ~794 level-4 parents (ordered by id) to hit the exact
TOTAL_TARGET of 52,486 nodes. 11,115 / 14 is not an integer, so the final
parent processed only contributes the leftover number of children instead
of a full 14 -- everything else gets a full batch of 14. The per-parent
take-count is decided up front (deterministically, in id order) and then
all parents are dispatched *concurrently* (bounded by CONCURRENCY).

Usage:
    python -m haiveminds_gen.generate_remainder
    python -m haiveminds_gen.generate_remainder --concurrency 500
"""
import argparse
import asyncio
import time

from .config import (
    BRANCHING_FACTOR, CONCURRENCY, BATCH_PROGRESS_EVERY,
    LEVEL5_TARGET, LEVEL5_PARENTS_NEEDED,
)
from .db import init_db, get_unprocessed_parents, insert_children, get_level_count
from .generate_helpers import generate_valid_children_async

LEVEL = 5
PARENT_LEVEL = 4


async def _process_parent(sem: asyncio.Semaphore, parent_id: int, parent_message: str, take: int,
                           counters: dict):
    async with sem:
        try:
            children = await generate_valid_children_async(parent_id, parent_message, take)
        except Exception as exc:  # noqa: BLE001
            counters["failed"] += 1
            print(f"  ! parent {parent_id} failed permanently: {exc!r}")
            return

    insert_children(parent_id, LEVEL, children)
    counters["produced"] += len(children)
    counters["done"] += 1
    if counters["done"] % BATCH_PROGRESS_EVERY == 0:
        print(f"  [{counters['done']}/{counters['total']}] parents processed | "
              f"level {LEVEL} total so far: {counters['already'] + counters['produced']}/{LEVEL5_TARGET}")


async def run_remainder_async(concurrency: int):
    already = get_level_count(LEVEL)
    remaining_target = LEVEL5_TARGET - already
    if remaining_target <= 0:
        print(f"Level {LEVEL} already has {already} nodes (target {LEVEL5_TARGET}). Nothing to do.")
        return

    parents = get_unprocessed_parents(PARENT_LEVEL, limit=LEVEL5_PARENTS_NEEDED + 5)
    if not parents:
        print(f"No unprocessed level-{PARENT_LEVEL} parents left; cannot reach {LEVEL5_TARGET} target.")
        return

    # Decide each parent's take-count up front, in id order, so the exact target is hit
    # regardless of concurrent completion order.
    plan = []
    produced_planned = 0
    for parent_id, parent_message in parents:
        if produced_planned >= remaining_target:
            break
        take = min(BRANCHING_FACTOR, remaining_target - produced_planned)
        plan.append((parent_id, parent_message, take))
        produced_planned += take

    print(f"Level {LEVEL}: need {remaining_target} more nodes (have {already}/{LEVEL5_TARGET}) "
          f"across {len(plan)} level-{PARENT_LEVEL} parent(s), up to {concurrency} concurrent request(s).")

    sem = asyncio.Semaphore(concurrency)
    counters = {"done": 0, "failed": 0, "produced": 0, "already": already, "total": len(plan)}
    started_at = time.monotonic()

    tasks = [
        _process_parent(sem, parent_id, parent_message, take, counters)
        for parent_id, parent_message, take in plan
    ]
    await asyncio.gather(*tasks)

    elapsed = time.monotonic() - started_at
    final_count = get_level_count(LEVEL)
    print(f"Level {LEVEL} complete in {elapsed:.1f}s: {final_count} nodes (target {LEVEL5_TARGET}); "
          f"{counters['failed']} parent(s) failed permanently and can be retried by re-running this command.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--concurrency", type=int, default=CONCURRENCY)
    args = parser.parse_args()

    init_db()
    asyncio.run(run_remainder_async(args.concurrency))


if __name__ == "__main__":
    main()
