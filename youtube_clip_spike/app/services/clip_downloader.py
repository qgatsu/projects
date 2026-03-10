from __future__ import annotations

import shutil
import subprocess
import unicodedata
from dataclasses import dataclass
from pathlib import Path
import re
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from uuid import uuid4


class ClipDownloadError(RuntimeError):
    """Raised when clip download failed."""


@dataclass(frozen=True)
class ClipDownloadResult:
    output_dir: str
    file_path: str
    start_time: float
    end_time: float


def download_clip(
    url: str,
    start_time: float,
    end_time: float,
    output_dir: Path,
    parallel_fragments: int = 24,
    pre_buffer_seconds: float = 10.0,
    video_title: str | None = None,
) -> ClipDownloadResult:
    if not url:
        raise ClipDownloadError("URL is required.")
    if end_time <= start_time:
        raise ClipDownloadError("Invalid clip range.")

    yt_dlp_bin = shutil.which("yt-dlp")
    if not yt_dlp_bin:
        raise ClipDownloadError("yt-dlp が見つかりません。")
    if not shutil.which("ffmpeg"):
        raise ClipDownloadError("ffmpeg が見つかりません。")

    normalized_url = _normalize_watch_url(url)
    output_dir.mkdir(parents=True, exist_ok=True)

    start_tag = int(max(0, start_time))
    end_tag = int(max(start_tag + 1, end_time))
    buffer_seconds = max(0.0, float(pre_buffer_seconds))
    buffered_start = max(0.0, start_time - buffer_seconds)
    buffered_end = max(buffered_start + 1.0, end_time)
    section = f"*{_format_hhmmss(buffered_start)}-{_format_hhmmss(buffered_end)}"
    title_tag = _sanitize_path_segment(video_title or "")
    if title_tag:
        clip_name = f"{title_tag}_{start_tag}-{end_tag}_{uuid4().hex[:8]}"
    else:
        clip_name = f"clip_{start_tag}-{end_tag}_{uuid4().hex[:8]}"
    clip_dir = output_dir / clip_name
    clip_dir.mkdir(parents=True, exist_ok=True)
    template = clip_dir / "source.%(ext)s"
    fragment_workers = max(1, min(int(parallel_fragments), 32))
    cmd = [
        yt_dlp_bin,
        "--no-playlist",
        "--force-overwrites",
        "--restrict-filenames",
        "-N",
        str(fragment_workers),
        "--download-sections",
        section,
        "--print",
        "after_move:filepath",
        "-o",
        str(template),
        normalized_url,
    ]
    if shutil.which("aria2c"):
        aria_workers = max(4, min(fragment_workers, 32))
        cmd.extend(
            [
                "--downloader",
                "aria2c",
                "--downloader-args",
                f"aria2c:-x {aria_workers} -s {aria_workers} -k 1M --file-allocation=none",
            ]
        )
    completed = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        message = completed.stderr.strip() or completed.stdout.strip() or "unknown error"
        raise ClipDownloadError(f"yt-dlp failed: {message}")

    lines = [line.strip() for line in completed.stdout.splitlines() if line.strip()]
    if not lines:
        raise ClipDownloadError("保存先ファイルの取得に失敗しました。")

    source_path = Path(lines[-1])
    if not source_path.exists():
        raise ClipDownloadError("生成ファイルが見つかりません。")

    final_suffix = source_path.suffix or ".mp4"
    final_path = clip_dir / f"video{final_suffix}"
    trim_offset = max(0.0, start_time - buffered_start)
    trim_duration = max(1.0, end_time - start_time)
    _trim_clip(source_path, final_path, trim_offset, trim_duration)

    try:
        source_path.unlink(missing_ok=True)
    except OSError:
        pass

    return ClipDownloadResult(
        output_dir=str(clip_dir),
        file_path=str(final_path),
        start_time=float(start_time),
        end_time=float(end_time),
    )


def _format_hhmmss(seconds: float) -> str:
    total = max(0, int(round(seconds)))
    hours = total // 3600
    minutes = (total % 3600) // 60
    remain = total % 60
    return f"{hours:02d}:{minutes:02d}:{remain:02d}"


def _normalize_watch_url(url: str) -> str:
    parsed = urlparse(url)
    query_items = parse_qsl(parsed.query, keep_blank_values=True)
    filtered = [(key, value) for key, value in query_items if key not in {"t", "start"}]
    return urlunparse(parsed._replace(query=urlencode(filtered, doseq=True)))


def _sanitize_path_segment(value: str, max_length: int = 64) -> str:
    text = unicodedata.normalize("NFKC", value).strip()
    if not text:
        return ""
    text = re.sub(r"[\\/:*?\"<>|]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = text.strip(". ")
    if not text:
        return ""
    return text[:max_length].strip()


def _trim_clip(source_path: Path, final_path: Path, start_offset: float, duration: float) -> None:
    copy_cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        f"{start_offset:.3f}",
        "-i",
        str(source_path),
        "-t",
        f"{duration:.3f}",
        "-c",
        "copy",
        str(final_path),
    ]
    copy_result = subprocess.run(copy_cmd, capture_output=True, text=True, check=False)
    if copy_result.returncode == 0 and final_path.exists():
        return

    reencode_cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        f"{start_offset:.3f}",
        "-i",
        str(source_path),
        "-t",
        f"{duration:.3f}",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "21",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        str(final_path),
    ]
    reencode_result = subprocess.run(
        reencode_cmd,
        capture_output=True,
        text=True,
        check=False,
    )
    if reencode_result.returncode != 0 or not final_path.exists():
        message = (
            reencode_result.stderr.strip()
            or copy_result.stderr.strip()
            or reencode_result.stdout.strip()
            or copy_result.stdout.strip()
            or "unknown error"
        )
        raise ClipDownloadError(f"ffmpeg trim failed: {message}")
