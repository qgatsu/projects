from __future__ import annotations

import hashlib
import json
from dataclasses import asdict
from typing import Iterable, List, Optional

from redis import Redis

from .chat_loader import ChatMessage


class MessageCache:
    """Simple Redis-backed cache for chat messages keyed by URL."""

    def __init__(self, redis_conn: Optional[Redis], ttl_seconds: int = 3600) -> None:
        self._redis = redis_conn
        self._ttl = max(0, int(ttl_seconds))

    def get(self, url: str) -> Optional[List[ChatMessage]]:
        if not self._redis or self._ttl <= 0 or not url:
            return None
        raw = self._redis.get(self._build_key(url))
        if not raw:
            return None
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            return None
        if not isinstance(payload, list):
            return None
        messages: List[ChatMessage] = []
        for entry in payload:
            if not isinstance(entry, dict):
                continue
            try:
                messages.append(
                    ChatMessage(
                        timestamp_seconds=float(entry.get("timestamp_seconds", 0.0)),
                        message=entry.get("message", ""),
                        is_member=bool(entry.get("is_member", False)),
                    )
                )
            except (TypeError, ValueError):
                continue
        return messages or None

    def set(self, url: str, messages: Iterable[ChatMessage]) -> None:
        if not self._redis or self._ttl <= 0 or not url:
            return
        serialized = [asdict(msg) for msg in messages]
        if not serialized:
            return
        self._redis.setex(self._build_key(url), self._ttl, json.dumps(serialized))

    @staticmethod
    def _build_key(url: str) -> str:
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()
        return f"chat-cache:{digest}"
