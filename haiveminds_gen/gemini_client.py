"""Thin wrapper around the Gemini API (google-genai SDK) with retries and JSON parsing."""
import asyncio
import json
import random
import re
import time

from google import genai
from google.genai import types

from .config import GEMINI_API_KEY, GEMINI_MODEL, MAX_RETRIES_PER_CALL

_client = None


def _get_client():
    global _client
    if _client is None:
        if not GEMINI_API_KEY:
            raise RuntimeError(
                "GEMINI_API_KEY is not set. Put it in a local .env file (see .env.example)."
            )
        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


def _extract_json_array(raw_text: str) -> list:
    text = raw_text.strip()
    # Strip ```json ... ``` or ``` ... ``` fences if the model added them anyway.
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def call_gemini_for_messages(prompt: str) -> list[str]:
    """Calls Gemini with the given prompt and returns a parsed list of message strings.
    Retries with exponential backoff on transient/parse failures."""
    client = _get_client()
    last_err = None

    for attempt in range(1, MAX_RETRIES_PER_CALL + 1):
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=1.0,
                ),
            )
            data = _extract_json_array(response.text)
            if not isinstance(data, list):
                raise ValueError(f"Expected a JSON array, got: {type(data)}")
            return [str(item) for item in data]
        except Exception as exc:  # noqa: BLE001 - broad on purpose, this loop is the retry boundary
            last_err = exc
            sleep_for = min(2 ** attempt, 30)
            print(f"  [gemini] attempt {attempt}/{MAX_RETRIES_PER_CALL} failed: {exc!r}; retrying in {sleep_for}s")
            time.sleep(sleep_for)

    raise RuntimeError(f"Gemini call failed after {MAX_RETRIES_PER_CALL} attempts: {last_err!r}")


async def call_gemini_for_messages_async(prompt: str) -> list[str]:
    """Async counterpart of call_gemini_for_messages, used for high-concurrency fan-out.
    Retries with exponential backoff + jitter on transient/parse failures."""
    client = _get_client()
    last_err = None

    for attempt in range(1, MAX_RETRIES_PER_CALL + 1):
        try:
            response = await client.aio.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=1.0,
                ),
            )
            data = _extract_json_array(response.text)
            if not isinstance(data, list):
                raise ValueError(f"Expected a JSON array, got: {type(data)}")
            return [str(item) for item in data]
        except Exception as exc:  # noqa: BLE001 - broad on purpose, this loop is the retry boundary
            last_err = exc
            sleep_for = min(2 ** attempt, 30) + random.uniform(0, 1.5)
            print(f"  [gemini] attempt {attempt}/{MAX_RETRIES_PER_CALL} failed: {exc!r}; retrying in {sleep_for:.1f}s")
            await asyncio.sleep(sleep_for)

    raise RuntimeError(f"Gemini call failed after {MAX_RETRIES_PER_CALL} attempts: {last_err!r}")
