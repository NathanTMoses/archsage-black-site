"""Validation helpers enforcing the messaging guardrails."""
import re
from .config import BANNED_WORDS, MIN_WORDS, MAX_WORDS


def word_count(text: str) -> int:
    return len(text.strip().split())


def validate_message(text: str) -> tuple[bool, str]:
    """Returns (is_valid, reason_if_invalid)."""
    if not isinstance(text, str) or not text.strip():
        return False, "empty or non-string message"

    text = text.strip()
    wc = word_count(text)
    if wc < MIN_WORDS or wc > MAX_WORDS:
        return False, f"word count {wc} outside [{MIN_WORDS}, {MAX_WORDS}]"

    lowered = text.lower()
    for banned in BANNED_WORDS:
        if re.search(rf"\b{re.escape(banned)}\b", lowered):
            return False, f"contains banned term '{banned}'"

    return True, ""


def dedupe_case_insensitive(messages: list[str]) -> list[str]:
    seen = set()
    out = []
    for m in messages:
        key = m.strip().lower()
        if key not in seen:
            seen.add(key)
            out.append(m.strip())
    return out
