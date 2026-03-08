from __future__ import annotations

from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable, Dict, List, Optional, Sequence, Tuple

from janome.tokenizer import Tokenizer

from .chat_loader import ChatLoader, ChatMessage
from .cps_analyzer import CPSAnalyzer
from .spike_detector import Spike, SpikeDetector
from .youtube_api import extract_video_id, fetch_video_duration_seconds

ProgressCallback = Callable[[int, Optional[float]], None]


def fetch_chat_messages(
    url: str,
    chat_config: Dict,
    youtube_config: Optional[Dict] = None,
    progress_callback: Optional[ProgressCallback] = None,
    chunk_size: int = 1000,
) -> List[ChatMessage]:
    youtube_config = youtube_config or {}
    base_chunk_size = max(1, int(chunk_size or 1000))
    video_id = extract_video_id(url)
    duration_hint = _resolve_video_duration(video_id, youtube_config)
    if _can_parallel_fetch(youtube_config):
        result = _fetch_parallel_messages(
            url=url,
            chat_config=chat_config,
            youtube_config=youtube_config,
            progress_callback=progress_callback,
            video_id=video_id,
            duration_seconds=duration_hint,
        )
        if result is not None:
            return result

    adaptive_chunk_size = _choose_chunk_size(base_chunk_size, duration_hint)
    return _fetch_sequential_messages(
        url=url,
        chat_config=chat_config,
        progress_callback=progress_callback,
        chunk_size=adaptive_chunk_size,
    )


def _fetch_sequential_messages(
    url: str,
    chat_config: Dict,
    progress_callback: Optional[ProgressCallback],
    chunk_size: int,
) -> List[ChatMessage]:
    loader = ChatLoader(request_timeout=chat_config["request_timeout"])
    messages: List[ChatMessage] = []
    processed = 0
    last_timestamp: Optional[float] = None
    chunk: List[ChatMessage] = []

    message_iter = loader.fetch_messages(
        url=url,
        message_limit=chat_config.get("message_limit"),
    )

    for msg in message_iter:
        chunk.append(msg)
        last_timestamp = msg.timestamp_seconds
        if len(chunk) >= chunk_size:
            messages.extend(chunk)
            processed += len(chunk)
            chunk.clear()
            if progress_callback:
                progress_callback(processed, last_timestamp)

    if chunk:
        messages.extend(chunk)
        processed += len(chunk)
        if progress_callback:
            progress_callback(processed, last_timestamp)

    return messages


def _fetch_parallel_messages(
    url: str,
    chat_config: Dict,
    youtube_config: Dict,
    progress_callback: Optional[ProgressCallback],
    video_id: Optional[str],
    duration_seconds: Optional[int],
) -> Optional[List[ChatMessage]]:
    api_key = youtube_config.get("api_key")
    segment_seconds = int(youtube_config.get("segment_duration_seconds", 0))
    max_workers = int(youtube_config.get("parallel_segments", 1))
    if not api_key or segment_seconds <= 0 or max_workers <= 1:
        return None

    if not video_id:
        return None

    duration = duration_seconds
    if not duration:
        try:
            duration = fetch_video_duration_seconds(video_id, api_key)
        except Exception:  # requests error or parsing error
            return None

    if not duration or duration <= segment_seconds:
        return None

    segments = _build_segments(duration, segment_seconds)
    if not segments:
        return None

    messages: List[ChatMessage] = []
    processed = 0

    def fetch_segment(segment: Tuple[int, Optional[int]]) -> List[ChatMessage]:
        start_sec, end_sec = segment
        loader = ChatLoader(request_timeout=chat_config["request_timeout"])
        start_label = _format_seconds(start_sec)
        end_label = _format_seconds(end_sec) if end_sec is not None else None
        iterator = loader.fetch_messages(
            url=url,
            start_time=start_label,
            end_time=end_label,
            message_limit=None,
        )
        return list(iterator)

    try:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_map = {executor.submit(fetch_segment, segment): segment for segment in segments}
            for future in as_completed(future_map):
                segment_messages = future.result()
                messages.extend(segment_messages)
                processed += len(segment_messages)
                if progress_callback:
                    last_ts = (
                        segment_messages[-1].timestamp_seconds if segment_messages else None
                    )
                    progress_callback(processed, last_ts)
    except Exception:
        return None

    messages.sort(key=lambda msg: msg.timestamp_seconds)
    limit = chat_config.get("message_limit")
    if limit:
        return messages[: int(limit)]
    return messages


def _build_segments(duration_seconds: int, segment_seconds: int) -> Sequence[Tuple[int, Optional[int]]]:
    segments: List[Tuple[int, Optional[int]]] = []
    start = 0
    while start < duration_seconds:
        end = min(duration_seconds, start + segment_seconds)
        segments.append((start, end))
        start = end
    return segments


def _format_seconds(value: Optional[int]) -> Optional[str]:
    if value is None:
        return None
    total = max(0, int(value))
    hours, remainder = divmod(total, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours}:{minutes:02d}:{seconds:02d}"


def _can_parallel_fetch(youtube_config: Dict) -> bool:
    return (
        bool(youtube_config.get("api_key"))
        and int(youtube_config.get("parallel_segments", 1)) > 1
        and int(youtube_config.get("segment_duration_seconds", 0)) > 0
    )


def _choose_chunk_size(default_chunk_size: int, duration_seconds: Optional[int]) -> int:
    base = max(1, default_chunk_size)
    if not duration_seconds or duration_seconds <= 0:
        return base
    if duration_seconds < 1800:  # under 30 minutes
        return max(200, base // 2)
    if duration_seconds < 7200:  # under 2 hours
        return base
    return min(2000, int(base * 1.5))


def _resolve_video_duration(video_id: Optional[str], youtube_config: Dict) -> Optional[int]:
    if not video_id:
        return None
    api_key = youtube_config.get("api_key")
    if not api_key:
        return None
    try:
        return fetch_video_duration_seconds(video_id, api_key)
    except Exception:
        return None


def analyze_messages(
    messages: List[ChatMessage],
    keyword: Optional[str],
    cps_config: Dict,
    spike_config: Dict,
) -> Dict:
    analyzer = CPSAnalyzer(
        bucket_size_seconds=cps_config["bucket_size_seconds"],
        smoothing_window_seconds=cps_config["smoothing_window_seconds"],
        smoothing_average_window=cps_config.get("smoothing_average_window", 6),
    )
    detector = SpikeDetector(
        min_prominence=spike_config["min_prominence"],
        min_gap_seconds=spike_config["min_gap_seconds"],
        pre_start_buffer_seconds=spike_config.get("pre_start_buffer_seconds", 0.0),
        greeting_head_seconds=spike_config.get("greeting_excluded_head_seconds", 0.0),
        greeting_tail_seconds=spike_config.get("greeting_excluded_tail_seconds", 0.0),
    )

    result = analyzer.analyze(messages, keyword=keyword)
    target_series = result.smoothed_keyword if keyword else result.smoothed_total
    spikes = detector.detect(result.time_axis, target_series)
    word_window_seconds = float(spike_config.get("word_window_seconds", 10))
    word_top_limit = int(spike_config.get("word_top_limit", 3))
    spike_words = _extract_spike_top_words(
        messages,
        spikes,
        window_seconds=max(0.0, word_window_seconds),
        top_limit=max(0, word_top_limit),
    )

    head_seconds = float(spike_config.get("greeting_excluded_head_seconds", 0.0) or 0.0)
    tail_seconds = float(spike_config.get("greeting_excluded_tail_seconds", 0.0) or 0.0)
    end_time = float(result.time_axis[-1]) if result.time_axis.size else 0.0

    return {
        "series": {
            "time_axis": result.time_axis.tolist(),
            "total": result.total_cps.tolist(),
            "member": result.member_cps.tolist(),
            "keyword": result.keyword_cps.tolist(),
            "smoothed_total": result.smoothed_total.tolist(),
            "smoothed_keyword": result.smoothed_keyword.tolist(),
        },
        "spikes": [
            {
                "start_time": spike.start_time,
                "peak_time": spike.peak_time,
                "peak_value": spike.peak_value,
                "top_words": spike_words[idx] if idx < len(spike_words) else [],
                "label": _classify_greeting_spike(
                    spike.peak_time, head_seconds, tail_seconds, end_time
                ),
            }
            for idx, spike in enumerate(spikes)
        ],
    }


_TOKENIZER: Tokenizer | None = None


def _extract_spike_top_words(
    messages: List[ChatMessage],
    spikes: Sequence[Spike],
    window_seconds: float,
    top_limit: int,
) -> List[List[Dict[str, int]]]:
    if not spikes or not messages or window_seconds <= 0 or top_limit <= 0:
        return [[] for _ in spikes]

    stats: List[List[Dict[str, int]]] = []
    start_idx = 0
    total = len(messages)
    for spike in spikes:
        window_start = max(0.0, spike.peak_time - window_seconds)
        window_end = spike.peak_time + window_seconds
        start_idx = _seek_start_index(messages, window_start, start_idx)
        idx = start_idx
        counter: Counter[str] = Counter()
        while idx < total:
            message = messages[idx]
            timestamp = message.timestamp_seconds
            if timestamp > window_end:
                break
            _update_word_counter(counter, message.message)
            idx += 1
        stats.append(_format_top_words(counter, top_limit))
    return stats


def _seek_start_index(
    messages: Sequence[ChatMessage], start_time: float, cursor: int
) -> int:
    total = len(messages)
    idx = cursor
    while idx < total and messages[idx].timestamp_seconds < start_time:
        idx += 1
    return idx


def _update_word_counter(counter: Counter[str], text: str | None) -> None:
    if not text:
        return
    tokenizer = _get_tokenizer()
    if tokenizer is None:
        return
    for token in tokenizer.tokenize(text):
        word = _extract_meaningful_token(token)
        if word:
            counter[word] += 1


def _format_top_words(counter: Counter[str], limit: int) -> List[Dict[str, int]]:
    if not counter or limit <= 0:
        return []
    capacity = max(1, limit)
    return [
        {"word": word, "count": count}
        for word, count in counter.most_common(capacity)
    ]


def _get_tokenizer() -> Tokenizer | None:
    global _TOKENIZER  # noqa: PLW0603
    if _TOKENIZER is None:
        try:
            _TOKENIZER = Tokenizer()
        except Exception:  # pragma: no cover - tokenizer init errors are unexpected
            _TOKENIZER = None
    return _TOKENIZER


EXCLUDED_POS = {"助詞", "助動詞", "記号", "フィラー", "接続詞"}


def _extract_meaningful_token(token) -> str | None:
    part_of_speech = token.part_of_speech.split(",") if token.part_of_speech else []
    if not part_of_speech or part_of_speech[0] in EXCLUDED_POS:
        return None
    base = token.base_form if token.base_form and token.base_form != "*" else token.surface
    word = base.strip()
    if not word:
        return None
    # 半角英数は小文字に統一
    normalized = word.lower()
    return normalized


def _classify_greeting_spike(
    peak_time: float,
    head_seconds: float,
    tail_seconds: float,
    end_time: float,
) -> Optional[str]:
    if head_seconds > 0 and peak_time <= head_seconds:
        return "greeting_head"
    if tail_seconds > 0 and end_time > 0 and peak_time >= max(0.0, end_time - tail_seconds):
        return "greeting_tail"
    return None
