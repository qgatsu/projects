from __future__ import annotations

from typing import Dict, Optional

from rq import get_current_job

from .job_utils import format_result
from .services.analysis_pipeline import analyze_messages, fetch_chat_messages
from .services.message_cache import MessageCache


def run_analysis_job(
    url: str,
    keyword: Optional[str],
    chat_config: Dict,
    youtube_config: Dict,
    cache_config: Dict,
    cps_config: Dict,
    spike_config: Dict,
) -> Dict:
    job = get_current_job()
    cache = MessageCache(
        redis_conn=getattr(job, "connection", None),
        ttl_seconds=(cache_config or {}).get("message_ttl_seconds", 86400),
    )
    _update_meta(
        job,
        status="running",
        processed_messages=0,
        last_timestamp=None,
        keyword=keyword,
    )

    def progress_callback(processed: int, last_timestamp: float | None) -> None:
        stable_timestamp = _monotonic_timestamp(job, last_timestamp)
        _update_meta(
            job,
            status="running",
            processed_messages=processed,
            last_timestamp=stable_timestamp,
        )

    try:
        messages = cache.get(url)
        if messages is None:
            messages = fetch_chat_messages(
                url=url,
                chat_config=chat_config,
                youtube_config=youtube_config,
                progress_callback=progress_callback,
            )
            cache.set(url, messages)
        elif progress_callback and messages:
            progress_callback(len(messages), messages[-1].timestamp_seconds)
        total_data = analyze_messages(messages, None, cps_config, spike_config)
        result_total = format_result(url, total_data)

        result_keyword = None
        if keyword:
            keyword_data = analyze_messages(messages, keyword, cps_config, spike_config)
            result_keyword = format_result(url, keyword_data)

        payload = {
            "result_total": result_total,
            "result_keyword": result_keyword,
            "messages": messages,
            "url": url,
        }
        _update_meta(
            job,
            status="completed",
            result_total=result_total,
            result_keyword=result_keyword,
        )
        return payload
    except ValueError as exc:
        _update_meta(job, status="error", error=str(exc))
        raise
    except Exception:  # pylint: disable=broad-except
        _update_meta(job, status="error", error="解析中にエラーが発生しました。")
        raise


def _update_meta(job, **fields) -> None:
    if not job:
        return
    meta = job.meta or {}
    meta.update(fields)
    job.meta = meta
    job.save_meta()


def _monotonic_timestamp(job, candidate: float | None) -> float | None:
    """Ensure reported timestamps never decrease for the same job."""
    if candidate is not None:
        try:
            candidate_val = float(candidate)
        except (TypeError, ValueError):
            candidate_val = None
    else:
        candidate_val = None
    previous_val = None
    if job and job.meta:
        prev_raw = job.meta.get("last_timestamp")
        if prev_raw is not None:
            try:
                previous_val = float(prev_raw)
            except (TypeError, ValueError):
                previous_val = None
    if candidate_val is None:
        return previous_val
    if previous_val is None:
        return candidate_val
    return max(previous_val, candidate_val)
