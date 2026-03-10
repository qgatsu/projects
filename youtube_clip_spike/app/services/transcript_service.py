from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional


class TranscriptError(RuntimeError):
    """Raised when transcript generation failed."""


@dataclass(frozen=True)
class TranscriptSegment:
    start: float
    end: float
    text: str
    speaker: str


def generate_transcript(
    video_path: Path,
    output_dir: Path,
    config: Dict,
) -> Optional[Path]:
    if not bool(config.get("enabled", False)):
        return None

    if not video_path.exists():
        raise TranscriptError("文字起こし対象の動画ファイルが見つかりません。")

    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:  # pragma: no cover
        raise TranscriptError("faster-whisper がインストールされていません。") from exc

    model_name = str(config.get("model", "small"))
    device = str(config.get("device", "cpu"))
    compute_type = str(config.get("compute_type", "int8"))
    language = (config.get("language") or "").strip() or None

    model = WhisperModel(model_name, device=device, compute_type=compute_type)
    raw_segments, _ = model.transcribe(
        str(video_path),
        language=language,
        vad_filter=True,
        beam_size=1,
        condition_on_previous_text=False,
    )

    text_segments: List[Dict[str, float | str]] = []
    for seg in raw_segments:
        text = (seg.text or "").strip()
        if not text:
            continue
        text_segments.append({
            "start": float(seg.start),
            "end": float(seg.end),
            "text": text,
        })

    if not text_segments:
        raise TranscriptError("文字起こし結果が空です。")

    speaker_segments = _run_diarization(video_path, config)
    merged = _merge_segments(text_segments, speaker_segments)

    output_dir.mkdir(parents=True, exist_ok=True)
    stem = video_path.stem
    transcript_path = output_dir / f"{stem}_transcript.txt"
    transcript_path.write_text(_render_transcript(merged), encoding="utf-8")
    return transcript_path


def _run_diarization(video_path: Path, config: Dict) -> List[Dict[str, float | str]]:
    if not bool(config.get("diarization_enabled", True)):
        return []

    token = (config.get("hf_token") or "").strip()
    if not token:
        return []

    diarization_model = str(
        config.get("diarization_model", "pyannote/speaker-diarization-3.1")
    )
    min_speakers = config.get("min_speakers")
    max_speakers = config.get("max_speakers")

    try:
        from pyannote.audio import Pipeline
    except ImportError as exc:  # pragma: no cover
        return []

    try:
        pipeline = Pipeline.from_pretrained(diarization_model, use_auth_token=token)
        diarization_kwargs: Dict[str, int] = {}
        if min_speakers is not None:
            diarization_kwargs["min_speakers"] = int(min_speakers)
        if max_speakers is not None:
            diarization_kwargs["max_speakers"] = int(max_speakers)

        diarization = pipeline(str(video_path), **diarization_kwargs)
        speaker_segments: List[Dict[str, float | str]] = []
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            speaker_segments.append(
                {
                    "start": float(turn.start),
                    "end": float(turn.end),
                    "speaker": str(speaker),
                }
            )
        return speaker_segments
    except Exception:
        return []


def _merge_segments(
    text_segments: List[Dict[str, float | str]],
    speaker_segments: List[Dict[str, float | str]],
) -> List[TranscriptSegment]:
    merged: List[TranscriptSegment] = []
    for seg in text_segments:
        start = float(seg["start"])
        end = float(seg["end"])
        speaker = _pick_speaker(start, end, speaker_segments)
        merged.append(
            TranscriptSegment(
                start=start,
                end=end,
                text=str(seg["text"]),
                speaker=speaker,
            )
        )
    return merged


def _pick_speaker(
    start: float,
    end: float,
    speaker_segments: List[Dict[str, float | str]],
) -> str:
    if not speaker_segments:
        return "SPEAKER_00"

    best_speaker = "SPEAKER_00"
    best_overlap = 0.0
    for sp in speaker_segments:
        overlap = _overlap_seconds(start, end, float(sp["start"]), float(sp["end"]))
        if overlap > best_overlap:
            best_overlap = overlap
            best_speaker = str(sp["speaker"])
    return best_speaker


def _overlap_seconds(a_start: float, a_end: float, b_start: float, b_end: float) -> float:
    return max(0.0, min(a_end, b_end) - max(a_start, b_start))


def _render_transcript(segments: List[TranscriptSegment]) -> str:
    rows = [
        f"[{_format_timestamp(seg.start)} - {_format_timestamp(seg.end)}] {seg.speaker}: {seg.text}"
        for seg in segments
    ]
    return "\n".join(rows) + "\n"


def _format_timestamp(value: float) -> str:
    total = max(0, int(value))
    hours = total // 3600
    minutes = (total % 3600) // 60
    seconds = total % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
