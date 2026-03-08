from __future__ import annotations

import re
import unicodedata
from datetime import date

from haraikomi_ocr.models import PaymentInfo

DATE_PATTERNS = [
    re.compile(
        r"(?:\b|(?:\u7d0d\u4ed8\u671f\u9650|\u652f\u6255\u671f\u9650|\u6255\u8fbc\u671f\u9650|\u7d0d\u671f|\u671f\u9650)\D*)"
        r"(?P<year>\d{2,4})[./-](?P<month>\d{1,2})[./-](?P<day>\d{1,2})"
    ),
    re.compile(
        r"(?:\b|(?:\u304a?\u652f\u6255\u671f\u9650|\u6255\u8fbc\u671f\u9650|\u7d0d\u4ed8\u671f\u9650|\u7d0d\u671f|\u671f\u9650)\D*)"
        r"(?P<year>\d{2,4})\s*\u5e74\s*(?P<month>\d{1,2})\s*\u6708\s*(?P<day>\d{1,2})\s*\u65e5"
    ),
    re.compile(r"(?P<year>\d{2,4})\s*\u5e74\s*(?P<month>\d{1,2})\s*\u6708\s*(?P<day>\d{1,2})\s*\u65e5"),
    re.compile(r"(?P<year>\d{2,4})[./-](?P<month>\d{1,2})[./-](?P<day>\d{1,2})"),
    re.compile(
        r"(?:\b|(?:\u7d0d\u4ed8\u671f\u9650|\u652f\u6255\u671f\u9650|\u6255\u8fbc\u671f\u9650|\u7d0d\u671f|\u671f\u9650)\D*)"
        r"(?P<month>\d{1,2})[./-](?P<day>\d{1,2})"
    ),
]

AMOUNT_PATTERNS = [
    re.compile(r"(?:\u91d1\u984d|\u8acb\u6c42\u984d|\u6599\u91d1)\D{0,8}(?P<amount>[0-9][0-9,]{0,11})"),
    re.compile(r"(?:YEN|JPY|\\)\s*(?P<amount>[0-9][0-9,]{0,11})"),
    re.compile(r"(?P<amount>[0-9][0-9,]{2,11})\s*(?:\u5186)"),
]

TITLE_LABELS = [
    "\u52a0\u5165\u8005\u540d",
    "\u53ce\u7d0d\u6a5f\u95a2",
    "\u4f1a\u793e\u540d",
    "\u4ef6\u540d",
    "\u5b9b\u5148",
]

DATE_LABELS = ("\u304a\u652f\u6255\u671f\u9650", "\u652f\u6255\u671f\u9650", "\u6255\u8fbc\u671f\u9650", "\u7d0d\u4ed8\u671f\u9650", "\u7d0d\u671f", "\u671f\u9650")
AMOUNT_LABELS = ("\u9818\u53ce\u91d1\u984d", "\u304a\u6255\u8fbc\u984d", "\u91d1\u984d", "\u8acb\u6c42\u984d", "\u6599\u91d1")
ORG_HINTS = ("\u682a\u5f0f\u4f1a\u793e", "(\u682a)", "\u4e8b\u696d\u6240", "\u30ac\u30b9", "\u96fb\u529b", "\u30bb\u30f3\u30bf\u30fc")
ORG_EXCLUDES = ("TEL", "\u4f4f\u6240", "\u304a\u5ba2\u69d8\u756a\u53f7", "\u8acb\u6c42\u5e74\u6708")


def parse_payment_info(raw_text: str, today: date | None = None) -> PaymentInfo:
    normalized = unicodedata.normalize("NFKC", raw_text or "")
    lines = [line.strip() for line in normalized.splitlines() if line.strip()]
    base_date = today or date.today()

    due_date = _extract_due_date(normalized, base_date)
    amount = _extract_amount(normalized)
    title = _extract_title(lines)
    notes = _build_notes(lines, due_date, amount)

    return PaymentInfo(
        due_date=due_date,
        amount=amount,
        title=title,
        notes=notes,
        raw_text=normalized,
    )


def parse_document_payment_info(payload: dict, raw_text: str = "", today: date | None = None) -> PaymentInfo:
    normalized_text = unicodedata.normalize("NFKC", raw_text or "")
    lines = [line.strip() for line in normalized_text.splitlines() if line.strip()]
    base_date = today or date.today()

    due_date = _extract_due_date_from_document(payload, base_date) or _extract_due_date(normalized_text, base_date)
    amount = _extract_amount_from_document(payload) or _extract_amount(normalized_text)
    title = _extract_title_from_document(payload) or _extract_title(lines)
    notes = _build_notes(lines, due_date, amount)

    return PaymentInfo(
        due_date=due_date,
        amount=amount,
        title=title,
        notes=notes,
        raw_text=normalized_text,
    )


def _extract_due_date(text: str, base_date: date) -> date | None:
    for pattern in DATE_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        year = match.groupdict().get("year")
        month = int(match.group("month"))
        day = int(match.group("day"))
        return _coerce_date(year, month, day, base_date)
    return None


def _coerce_date(year_text: str | None, month: int, day: int, base_date: date) -> date | None:
    try:
        if year_text:
            year = int(year_text)
            if year < 100:
                year += 2000
            return date(year, month, day)

        candidate = date(base_date.year, month, day)
        if candidate < base_date and (base_date - candidate).days > 30:
            return date(base_date.year + 1, month, day)
        return candidate
    except ValueError:
        return None


def _extract_amount(text: str) -> int | None:
    for pattern in AMOUNT_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        value = match.group("amount").replace(",", "")
        try:
            return int(value)
        except ValueError:
            continue
    return None


def _extract_amount_from_document(payload: dict) -> int | None:
    for table in payload.get("tables", []):
        row_map: dict[int, list[dict]] = {}
        for cell in table.get("cells", []):
            row_map.setdefault(int(cell.get("row", 0)), []).append(cell)

        for cells in row_map.values():
            label_cell = next((cell for cell in cells if _contains_any(_normalize_text(cell.get("contents", "")), AMOUNT_LABELS)), None)
            if not label_cell:
                continue
            for cell in sorted(cells, key=lambda item: int(item.get("col", 0))):
                if cell is label_cell:
                    continue
                amount = _extract_amount(_normalize_text(cell.get("contents", "")))
                if amount is not None:
                    return amount

    for paragraph in payload.get("paragraphs", []):
        text = _normalize_text(paragraph.get("contents", ""))
        if not _contains_any(text, AMOUNT_LABELS):
            continue
        amount = _extract_amount(text)
        if amount is not None:
            return amount

    return _extract_labeled_value_from_words(payload, AMOUNT_LABELS, _extract_amount)


def _extract_due_date_from_document(payload: dict, base_date: date) -> date | None:
    for paragraph in payload.get("paragraphs", []):
        text = _normalize_text(paragraph.get("contents", ""))
        if not _contains_any(text, DATE_LABELS):
            continue
        due_date = _extract_due_date(text, base_date)
        if due_date is not None:
            return due_date

    return _extract_labeled_value_from_words(
        payload,
        DATE_LABELS,
        lambda text: _extract_due_date(text, base_date),
    )


def _extract_title_from_document(payload: dict) -> str | None:
    best_score = -1
    best_value: str | None = None

    for paragraph in payload.get("paragraphs", []):
        text = _normalize_text(paragraph.get("contents", ""))
        if not text:
            continue

        for line in [segment.strip() for segment in text.splitlines() if segment.strip()]:
            score = _score_organization_candidate(line)
            if score > best_score:
                best_score = score
                best_value = line

        lines = [segment.strip() for segment in text.splitlines() if segment.strip()]
        for idx, line in enumerate(lines):
            if "\u7dca\u6025\u9023\u7d61\u5148" in line and idx + 1 < len(lines):
                candidate = lines[idx + 1]
                score = _score_organization_candidate(candidate) + 3
                if score > best_score:
                    best_score = score
                    best_value = candidate

    if best_score > 0:
        return best_value
    return None


def _extract_title(lines: list[str]) -> str:
    for line in lines:
        for label in TITLE_LABELS:
            if label in line:
                parts = re.split(r"\s*[:\uff1a]\s*", line, maxsplit=1)
                if len(parts) == 2 and parts[1].strip():
                    return parts[1].strip()
                return line.strip()

    for line in lines:
        if re.search(r"\d", line):
            continue
        if len(line) < 3:
            continue
        return line

    return "Payment reminder"


def _build_notes(lines: list[str], due_date: date | None, amount: int | None) -> str:
    details: list[str] = []

    if due_date:
        details.append(f"Due date: {due_date.isoformat()}")
    if amount is not None:
        details.append(f"Amount: JPY {amount:,}")

    preview_lines = lines[:8]
    if preview_lines:
        details.append("")
        details.append("OCR preview:")
        details.extend(preview_lines)

    return "\n".join(details).strip()


def _extract_labeled_value_from_words(payload: dict, labels: tuple[str, ...], extractor) -> object | None:
    words = [_to_word_box(word) for word in payload.get("words", [])]
    words = [word for word in words if word]

    for label_word in words:
        if not _contains_any(label_word["text"], labels):
            continue

        candidates = []
        for candidate in words:
            if candidate is label_word:
                continue
            if candidate["left"] <= label_word["right"]:
                continue
            if abs(candidate["center_y"] - label_word["center_y"]) > max(18, label_word["height"] * 0.8):
                continue

            value = extractor(candidate["text"])
            if value is None:
                continue

            score = abs(candidate["center_y"] - label_word["center_y"]) + (candidate["left"] - label_word["right"]) / 10
            candidates.append((score, value))

        if candidates:
            candidates.sort(key=lambda item: item[0])
            return candidates[0][1]

    return None


def _to_word_box(word: dict) -> dict | None:
    points = word.get("points") or []
    if not points:
        return None

    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    text = _normalize_text(word.get("content", ""))
    if not text:
        return None

    top = min(ys)
    bottom = max(ys)
    left = min(xs)
    right = max(xs)

    return {
        "text": text,
        "top": top,
        "bottom": bottom,
        "left": left,
        "right": right,
        "center_y": (top + bottom) / 2,
        "height": max(1, bottom - top),
    }


def _normalize_text(value: str) -> str:
    return unicodedata.normalize("NFKC", value or "").strip()


def _contains_any(text: str, labels: tuple[str, ...]) -> bool:
    return any(label in text for label in labels)


def _score_organization_candidate(text: str) -> int:
    if not text:
        return -10
    if any(excluded in text for excluded in ORG_EXCLUDES):
        return -5

    score = 0
    if any(hint in text for hint in ORG_HINTS):
        score += 4
    if "\u7d0d\u4ee3\u884c" in text:
        score -= 2
    if re.search(r"\d{2,}", text):
        score -= 2
    if len(text) < 4:
        score -= 3
    if any(suffix in text for suffix in ("\u69d8", "\u5fa1\u4e2d", "\u5bbb")):
        score -= 3
    return score
