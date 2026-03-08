from __future__ import annotations

from dataclasses import asdict, dataclass, is_dataclass
from io import BytesIO
from time import perf_counter

import numpy as np
from PIL import Image
from yomitoku import DocumentAnalyzer, OCR

_OCR_ENGINE = None
_DOCUMENT_ANALYZER = None


@dataclass
class OCRRunResult:
    engine: str
    elapsed_ms: int
    raw_text: str
    payload: dict


def analyze_image(image_bytes: bytes, engine: str = "ocr") -> OCRRunResult:
    """Run a Yomitoku engine and return timing plus a flattened text view."""
    if engine not in {"ocr", "document_analyzer"}:
        raise ValueError(f"Unsupported engine: {engine}")

    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    image_array = np.array(image)
    runner = _get_ocr_engine() if engine == "ocr" else _get_document_analyzer()
    started_at = perf_counter()
    result = _unwrap_result(runner(image_array))
    elapsed_ms = int((perf_counter() - started_at) * 1000)
    payload = _result_to_dict(result)
    raw_text = _flatten_payload(payload, engine)
    return OCRRunResult(
        engine=engine,
        elapsed_ms=elapsed_ms,
        raw_text=raw_text,
        payload=payload,
    )


def extract_text_from_image(image_bytes: bytes) -> str:
    """Backward-compatible helper that uses the plain OCR engine."""
    return analyze_image(image_bytes, engine="ocr").raw_text


def _result_to_dict(result) -> dict:
    if isinstance(result, dict):
        return _make_json_safe(result)
    if hasattr(result, "model_dump"):
        return _make_json_safe(result.model_dump())
    if hasattr(result, "dict"):
        return _make_json_safe(result.dict())
    if is_dataclass(result):
        return _coerce_mapping(asdict(result))
    if hasattr(result, "__dict__"):
        return _coerce_mapping(vars(result))
    raise TypeError(f"Unsupported Yomitoku result type: {type(result)!r}")


def _get_ocr_engine() -> OCR:
    global _OCR_ENGINE
    if _OCR_ENGINE is None:
        _OCR_ENGINE = OCR(device="cpu")
    return _OCR_ENGINE


def _get_document_analyzer() -> DocumentAnalyzer:
    global _DOCUMENT_ANALYZER
    if _DOCUMENT_ANALYZER is None:
        _DOCUMENT_ANALYZER = DocumentAnalyzer(device="cpu")
    return _DOCUMENT_ANALYZER


def _flatten_payload(payload: dict, engine: str) -> str:
    if engine == "document_analyzer":
        text = _extract_from_document_payload(payload)
        if text:
            return text
    return _extract_from_word_payload(payload)


def _extract_from_document_payload(payload: dict) -> str:
    chunks: list[str] = []

    for paragraph in payload.get("paragraphs", []):
        text = _normalize_fragment(paragraph.get("contents"))
        if text:
            chunks.append(text)

    for table in payload.get("tables", []):
        for cell in table.get("cells", []):
            text = _normalize_fragment(cell.get("contents"))
            if text:
                chunks.append(text)

    if not chunks:
        return ""

    return "\n".join(_dedupe_keep_order(chunks))


def _extract_from_word_payload(payload: dict) -> str:
    words = payload.get("words", [])
    texts = [str(word.get("content", "")).strip() for word in words if str(word.get("content", "")).strip()]
    return "\n".join(texts).strip()


def _normalize_fragment(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        parts = [_normalize_fragment(item) for item in value]
        parts = [part for part in parts if part]
        return " ".join(parts).strip()
    if isinstance(value, dict):
        if "content" in value:
            return _normalize_fragment(value["content"])
        if "contents" in value:
            return _normalize_fragment(value["contents"])
    return str(value).strip()


def _dedupe_keep_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    return ordered


def _make_json_safe(value):
    if isinstance(value, dict):
        return {str(key): _make_json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_make_json_safe(item) for item in value]
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, np.generic):
        return value.item()
    if is_dataclass(value):
        return _make_json_safe(asdict(value))
    if hasattr(value, "__dict__"):
        return _make_json_safe(vars(value))
    return value


def _coerce_mapping(value: dict) -> dict:
    safe_value = _make_json_safe(value)
    if isinstance(safe_value, dict):
        return safe_value
    return {"value": safe_value}


def _unwrap_result(result):
    if isinstance(result, tuple):
        if not result:
            raise TypeError("Unsupported Yomitoku result type: empty tuple")
        # Per Yomitoku docs, module calls return (results, ...visualizations).
        return _unwrap_result(result[0])
    return result
