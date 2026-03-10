from __future__ import annotations

import shutil
from pathlib import Path
from typing import Dict
from uuid import uuid4

from flask import (
    Blueprint,
    Flask,
    after_this_request,
    current_app,
    jsonify,
    render_template,
    request,
    send_file,
)
from redis import Redis
from rq import Queue
from rq.exceptions import NoSuchJobError
from rq.job import Job

from .job_utils import format_result
from .services.analysis_pipeline import analyze_messages
from .services.clip_downloader import ClipDownloadError, download_clip
from .services.transcript_service import TranscriptError, generate_transcript
from .services.youtube_api import fetch_video_metadata

PEAK_POSITION_RATIO = 0.75


def register_routes(app: Flask) -> None:
    bp = Blueprint("main", __name__)

    @bp.get("/")
    def index():
        return render_template("index.html")

    @bp.post("/analyze/start")
    def start_analysis():
        payload = request.get_json(silent=True) or request.form
        url = (payload.get("url") or "").strip()
        keyword = (payload.get("keyword") or "").strip() or None
        if not url:
            return jsonify({"error": "URL is required"}), 400

        job_id = str(uuid4())
        queue = _get_queue()
        redis_cfg = current_app.config["REDIS"]
        job = queue.enqueue(
            "app.worker.run_analysis_job",
            kwargs={
                "url": url,
                "keyword": keyword,
                "chat_config": current_app.config["CHATDOWNLOADER"],
                "youtube_config": current_app.config.get("YOUTUBE", {}),
                "cache_config": current_app.config.get("CHAT_CACHE", {}),
                "cps_config": current_app.config["CPS"],
                "spike_config": current_app.config["SPIKE_DETECTION"],
            },
            job_id=job_id,
            result_ttl=redis_cfg["result_ttl"],
            meta={
                "status": "queued",
                "processed_messages": 0,
                "last_timestamp": None,
                "keyword": keyword,
            },
        )

        return jsonify({"job_id": job.id})

    @bp.get("/analyze/status/<job_id>")
    def job_status(job_id: str):
        job = _fetch_job(job_id)
        if not job:
            return jsonify({"error": "job not found"}), 404
        return jsonify(_serialize_job(job))

    @bp.post("/analyze/recompute/<job_id>")
    def recompute(job_id: str):
        payload = request.get_json(silent=True) or request.form
        keyword = (payload.get("keyword") or "").strip() or None
        job = _fetch_job(job_id)
        if job is None:
            return jsonify({"error": "job not found"}), 404
        if job.get_status() != "finished":
            return jsonify({"error": "job not ready"}), 400

        job_payload = job.result or {}
        messages = job_payload.get("messages")
        job_url = job_payload.get("url")
        if not messages or not job_url:
            return jsonify({"error": "job payload missing"}), 400

        cps_config = current_app.config["CPS"]
        spike_config = current_app.config["SPIKE_DETECTION"]
        data = analyze_messages(messages, keyword, cps_config, spike_config)
        result = format_result(job_url, data)
        meta = job.meta or {}
        meta.update({"result_keyword": result, "keyword": keyword})
        job.meta = meta
        job.save_meta()
        return jsonify({"result": result})

    @bp.get("/api/video-info")
    def video_info():
        url = (request.args.get("url") or request.form.get("url") or "").strip()
        if not url:
            return jsonify({"error": "URL is required"}), 400
        youtube_cfg = current_app.config.get("YOUTUBE", {})
        try:
            metadata = fetch_video_metadata(url, youtube_cfg.get("api_key"))
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception:  # pylint: disable=broad-except
            return jsonify({"error": "動画情報の取得に失敗しました。"}), 500
        return jsonify({"video": metadata})

    @bp.post("/api/clips/download")
    def download_spike_clip():
        payload = request.get_json(silent=True) or request.form
        url = (payload.get("url") or "").strip()
        video_title = (payload.get("video_title") or "").strip() or None
        if not url:
            return jsonify({"error": "URL is required"}), 400

        try:
            peak_time = float(payload.get("peak_time", 0))
            clip_duration = _resolve_clip_duration_seconds(payload)
        except (TypeError, ValueError):
            return jsonify({"error": "invalid numeric payload"}), 400
        if peak_time < 0 or clip_duration <= 0:
            return jsonify({"error": "invalid clip range"}), 400

        start_time = max(0.0, peak_time - clip_duration * PEAK_POSITION_RATIO)
        end_time = max(start_time + 1.0, start_time + clip_duration)
        output_dir = Path(
            current_app.config.get("CLIP_DOWNLOAD", {}).get("output_dir", "downloads")
        ).expanduser()
        has_speaker_override = "clip_speaker_count" in payload
        clip_speaker_count = payload.get("clip_speaker_count")
        parallel_fragments = int(
            current_app.config.get("CLIP_DOWNLOAD", {}).get("parallel_fragments", 24)
        )
        try:
            result = download_clip(
                url,
                start_time,
                end_time,
                output_dir,
                parallel_fragments=parallel_fragments,
                video_title=video_title,
            )
        except ClipDownloadError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception:  # pylint: disable=broad-except
            return jsonify({"error": "切り抜き保存に失敗しました。"}), 500
        file_path = Path(result.file_path)
        if not file_path.exists():
            return jsonify({"error": "生成ファイルが見つかりません。"}), 500
        clip_dir = Path(result.output_dir)
        transcript_cfg = current_app.config.get("TRANSCRIPT", {})
        if transcript_cfg.get("enabled", False):
            request_transcript_cfg = dict(transcript_cfg)
            if has_speaker_override:
                normalized_speaker_count = _normalize_clip_speaker_count(clip_speaker_count)
                if normalized_speaker_count is None:
                    request_transcript_cfg["min_speakers"] = None
                    request_transcript_cfg["max_speakers"] = None
                else:
                    request_transcript_cfg["min_speakers"] = normalized_speaker_count
                    request_transcript_cfg["max_speakers"] = normalized_speaker_count
            try:
                generate_transcript(
                    video_path=file_path,
                    output_dir=clip_dir,
                    config=request_transcript_cfg,
                )
            except TranscriptError as exc:
                current_app.logger.warning("Transcript skipped: %s", exc)
            except Exception as exc:  # pylint: disable=broad-except
                current_app.logger.exception("Transcript generation failed: %s", exc)

        zip_path = clip_dir.with_suffix(".zip")
        try:
            archive = shutil.make_archive(
                str(clip_dir),
                "zip",
                root_dir=str(clip_dir.parent),
                base_dir=clip_dir.name,
            )
            zip_path = Path(archive)
        except Exception:  # pylint: disable=broad-except
            return jsonify({"error": "保存ファイルの圧縮に失敗しました。"}), 500

        @after_this_request
        def cleanup_download(_response):
            try:
                shutil.rmtree(result.output_dir, ignore_errors=True)
            except Exception:  # pylint: disable=broad-except
                pass
            try:
                zip_path.unlink(missing_ok=True)
            except Exception:  # pylint: disable=broad-except
                pass
            return _response

        return send_file(
            zip_path,
            as_attachment=True,
            download_name=zip_path.name,
            conditional=False,
            max_age=0,
        )

    app.register_blueprint(bp)


def _redis_connection() -> Redis:
    redis_cfg = current_app.config["REDIS"]
    return Redis.from_url(redis_cfg["url"])


def _get_queue() -> Queue:
    redis_cfg = current_app.config["REDIS"]
    return Queue(
        redis_cfg["queue_name"],
        connection=_redis_connection(),
        default_timeout=redis_cfg["job_timeout"],
    )


def _fetch_job(job_id: str) -> Job | None:
    try:
        return Job.fetch(job_id, connection=_redis_connection())
    except NoSuchJobError:
        return None


def _serialize_job(job: Job) -> Dict:
    meta = job.meta or {}
    job_status = meta.get("status") or job.get_status()
    status = _map_status(job_status or job.get_status())
    payload: Dict = {
        "job_id": job.id,
        "status": status,
        "processed_messages": meta.get("processed_messages", 0),
        "last_timestamp": meta.get("last_timestamp"),
        "keyword": meta.get("keyword"),
        "error": meta.get("error"),
    }
    if status == "completed":
        result = job.result or {}
        payload["result_total"] = result.get("result_total") or meta.get("result_total")
        payload["result_keyword"] = result.get("result_keyword") or meta.get(
            "result_keyword"
        )
    return payload


def _map_status(raw_status: str | None) -> str:
    if raw_status in {"queued", "scheduled"}:
        return "queued"
    if raw_status in {"started", "running"}:
        return "running"
    if raw_status in {"finished", "completed"}:
        return "completed"
    if raw_status in {"failed", "error"}:
        return "error"
    return raw_status or "queued"


def _normalize_clip_speaker_count(raw_value) -> int | None:
    if raw_value is None:
        return None
    if isinstance(raw_value, str) and raw_value.strip().lower() in {"", "auto"}:
        return None
    try:
        count = int(raw_value)
    except (TypeError, ValueError):
        return None
    if count < 1:
        return None
    return count


def _resolve_clip_duration_seconds(payload: Dict) -> float:
    duration_raw = payload.get("clip_duration_seconds")
    if duration_raw is not None:
        duration = float(duration_raw)
        if duration <= 0:
            raise ValueError("invalid clip duration")
        return duration

    # Backward compatibility for older clients.
    padding = float(payload.get("clip_padding_seconds", 15))
    if padding <= 0:
        raise ValueError("invalid clip padding")
    return padding * 2
