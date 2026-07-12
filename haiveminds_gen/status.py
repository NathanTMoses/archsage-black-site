"""
Quick progress report.

Usage:
    python -m haiveminds_gen.status
"""
from .config import TOTAL_TARGET, LEVEL_SIZES, LEVEL5_TARGET
from .db import init_db, counts_by_level, total_count


def main():
    init_db()
    counts = counts_by_level()
    expected = {**LEVEL_SIZES, 5: LEVEL5_TARGET}

    print("Level | Count      | Expected")
    print("------+------------+---------")
    for level in range(0, 6):
        c = counts.get(level, 0)
        e = expected.get(level, "-")
        print(f"{level:>5} | {c:>10} | {e}")

    print(f"\nTotal: {total_count()} / {TOTAL_TARGET}")


if __name__ == "__main__":
    main()
