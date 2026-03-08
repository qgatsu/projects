from __future__ import annotations

import os
import re
from functools import lru_cache
from typing import Any, Dict, Optional
from urllib.parse import parse_qs, urlparse

import requests


_VIDEO_ID_RE = re.compile(r"[0-9A-Za-z_-]{6,}")
_YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"


def extract_video_id(value: str) -> Optional[str]:
    """Extracts a YouTube video ID from several URL formats or a raw ID."""
    if not value:
        return None
    value = value.strip()
    if _VIDEO_ID_RE.fullmatch(value):
        return value

    parsed = urlparse(value)
    host = parsed.netloc.lower()
    path = parsed.path

    if host in {"youtu.be", "www.youtu.be"}:
        vid = path.lstrip("/").split("/", 1)[0]
        return vid or None

    if host.endswith("youtube.com"):
        qs = parse_qs(parsed.query)
        if "v" in qs:
            return qs["v"][0]
        match = re.match(r"^/(?:embed|shorts|live)/([0-9A-Za-z_-]{6,})", path)
        if match:
            return match.group(1)
        if path.startswith("/watch/"):
            parts = path.split("/")
            candidate = parts[2] if len(parts) > 2 else ""
            if _VIDEO_ID_RE.fullmatch(candidate):
                return candidate
    return None


@lru_cache(maxsize=128)
def fetch_video_duration_seconds(video_id: str, api_key: str | None) -> Optional[int]:
    if not api_key or not video_id:
        return None
    params = {
        "key": api_key,
        "part": "contentDetails",
        "id": video_id,
    }
    resp = requests.get(
        _YOUTUBE_VIDEOS_URL,
        params=params,
        timeout=float(os.getenv("YOUTUBE_API_TIMEOUT", 10)),
    )
    resp.raise_for_status()
    data = resp.json()
    items = data.get("items") or []
    if not items:
        return None
    duration_iso = items[0].get("contentDetails", {}).get("duration")
    return _parse_iso8601_duration(duration_iso)


def fetch_video_metadata(url: str, api_key: Optional[str]) -> Dict[str, Any]:
    if not url:
        raise ValueError("URL is required")
    video_id = extract_video_id(url)
    if not video_id:
        raise ValueError("動画IDをURLから抽出できませんでした。")
    item = _fetch_video_item(video_id, api_key)
    if not item:
        raise ValueError("動画情報を取得できませんでした。")
    snippet = item.get("snippet", {}) or {}
    statistics = item.get("statistics", {}) or {}
    content_details = item.get("contentDetails", {}) or {}
    duration_seconds = _parse_iso8601_duration(content_details.get("duration"))
    view_count = int(statistics.get("viewCount", 0) or 0)
    return {
        "video_id": video_id,
        "title": snippet.get("title"),
        "channel_title": snippet.get("channelTitle"),
        "published_at": snippet.get("publishedAt"),
        "thumbnail_url": _extract_thumbnail_url(snippet),
        "view_count": view_count,
        "view_count_text": f"{view_count:,}",
        "duration_seconds": duration_seconds,
        "duration_text": format_duration(duration_seconds),
        "url": f"https://www.youtube.com/watch?v={video_id}",
    }


def _parse_iso8601_duration(value: Optional[str]) -> Optional[int]:
    if not value:
        return None
    pattern = re.compile(
        r"^PT"
        r"(?:(?P<hours>\d+)H)?"
        r"(?:(?P<minutes>\d+)M)?"
        r"(?:(?P<seconds>\d+)S)?$"
    )
    match = pattern.match(value)
    if not match:
        return None
    hours = int(match.group("hours") or 0)
    minutes = int(match.group("minutes") or 0)
    seconds = int(match.group("seconds") or 0)
    return hours * 3600 + minutes * 60 + seconds


def _fetch_video_item(video_id: str, api_key: Optional[str]) -> Optional[Dict[str, Any]]:
    if not api_key:
        raise ValueError("YOUTUBE_API_KEY is not configured.")
    params = {
        "key": api_key,
        "part": "snippet,statistics,contentDetails",
        "id": video_id,
    }
    resp = requests.get(
        _YOUTUBE_VIDEOS_URL,
        params=params,
        timeout=float(os.getenv("YOUTUBE_API_TIMEOUT", 10)),
    )
    resp.raise_for_status()
    data = resp.json()
    items = data.get("items") or []
    if not items:
        return None
    return items[0]


def _extract_thumbnail_url(snippet: Dict[str, Any]) -> Optional[str]:
    thumbnails = snippet.get("thumbnails") or {}
    for key in ("high", "medium", "default"):
        target = thumbnails.get(key) or {}
        url = target.get("url")
        if url:
            return url
    return None


def format_duration(value: Optional[int]) -> Optional[str]:
    if value is None:
        return None
    hours, remainder = divmod(value, 3600)
    minutes, seconds = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"
