"""Shared logic for requesting a validated, deduped batch of N child messages for a parent node."""
from .config import rotate_matrix, MAX_RETRIES_PER_CALL
from .prompts import build_children_prompt
from .gemini_client import call_gemini_for_messages, call_gemini_for_messages_async
from .validate import validate_message, dedupe_case_insensitive


def generate_valid_children(parent_id: int, parent_message: str, needed: int) -> list[str]:
    """Requests `needed` valid, unique 5-10 word messages for a parent node.
    Tops up with extra calls (rotating the matrix variables again) if some
    candidates fail validation or turn out to be duplicates."""
    accepted: list[str] = []
    attempts = 0

    while len(accepted) < needed and attempts < MAX_RETRIES_PER_CALL:
        attempts += 1
        # Rotate matrix variables per attempt/parent so retries don't just repeat the same call.
        industry, business_function, technical_aspect = rotate_matrix(parent_id * 97 + attempts)
        remaining = needed - len(accepted)
        # Ask for a small buffer beyond what's strictly needed to absorb validation failures.
        ask_count = remaining + 3

        prompt = build_children_prompt(
            parent_message, industry, business_function, technical_aspect, ask_count
        )
        candidates = call_gemini_for_messages(prompt)
        candidates = dedupe_case_insensitive(candidates)

        for candidate in candidates:
            ok, _reason = validate_message(candidate)
            if not ok:
                continue
            key = candidate.strip().lower()
            if key in {a.strip().lower() for a in accepted}:
                continue
            accepted.append(candidate.strip())
            if len(accepted) == needed:
                break

    if len(accepted) < needed:
        raise RuntimeError(
            f"Could not gather {needed} valid messages for parent {parent_id} "
            f"after {attempts} attempts (got {len(accepted)})."
        )

    return accepted[:needed]


async def generate_valid_children_async(parent_id: int, parent_message: str, needed: int) -> list[str]:
    """Async counterpart of generate_valid_children, for use under a concurrency semaphore."""
    accepted: list[str] = []
    attempts = 0

    while len(accepted) < needed and attempts < MAX_RETRIES_PER_CALL:
        attempts += 1
        industry, business_function, technical_aspect = rotate_matrix(parent_id * 97 + attempts)
        remaining = needed - len(accepted)
        ask_count = remaining + 3

        prompt = build_children_prompt(
            parent_message, industry, business_function, technical_aspect, ask_count
        )
        candidates = await call_gemini_for_messages_async(prompt)
        candidates = dedupe_case_insensitive(candidates)

        for candidate in candidates:
            ok, _reason = validate_message(candidate)
            if not ok:
                continue
            key = candidate.strip().lower()
            if key in {a.strip().lower() for a in accepted}:
                continue
            accepted.append(candidate.strip())
            if len(accepted) == needed:
                break

    if len(accepted) < needed:
        raise RuntimeError(
            f"Could not gather {needed} valid messages for parent {parent_id} "
            f"after {attempts} attempts (got {len(accepted)})."
        )

    return accepted[:needed]
