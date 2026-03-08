from __future__ import annotations

from datetime import date
import logging
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from haraikomi_ocr.calendar_client import create_calendar_event
from haraikomi_ocr.ocr import analyze_image
from haraikomi_ocr.parser import parse_document_payment_info

PROJECT_ROOT = Path(__file__).parent
CREDENTIALS_PATH = PROJECT_ROOT / "credentials.json"
TOKEN_PATH = PROJECT_ROOT / "token.json"
STATIC_DIR = PROJECT_ROOT / "static"
DEFAULT_CALENDAR_ID = "primary"

app = FastAPI(title="haraikomi-OCR")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
logger = logging.getLogger("haraikomi_ocr")


class CalendarRequest(BaseModel):
    title: str
    due_date: date
    amount: int | None = None
    notes: str = ""


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.post("/api/ocr")
async def ocr_payment_slip(file: UploadFile = File(...)) -> dict:
    image_bytes = await _read_uploaded_image(file)

    try:
        result = await run_in_threadpool(analyze_image, image_bytes, "document_analyzer")
        payment = await run_in_threadpool(parse_document_payment_info, result.payload, result.raw_text)
    except Exception as exc:
        logger.exception("OCR endpoint failed")
        raise HTTPException(status_code=500, detail=f"OCR failed: {exc}") from exc

    return {
        "engine": result.engine,
        "elapsed_ms": result.elapsed_ms,
        "raw_text": result.raw_text,
        "payload": result.payload,
        "payment": {
            "title": payment.title,
            "due_date": payment.due_date.isoformat() if payment.due_date else None,
            "amount": payment.amount,
            "notes": payment.notes,
        },
    }


@app.post("/api/calendar")
def create_calendar_reminder(payload: CalendarRequest) -> dict:
    if not CREDENTIALS_PATH.exists():
        raise HTTPException(
            status_code=400,
            detail="Missing credentials.json at /app/credentials.json. Put your Google OAuth client file in the project root and restart the container.",
        )
    if not TOKEN_PATH.exists():
        raise HTTPException(
            status_code=400,
            detail="Missing token.json at /app/token.json. Run `docker compose run --rm --service-ports app python scripts/bootstrap_google_token.py` first.",
        )

    summary = payload.title.strip() or "Payment reminder"
    if payload.amount is not None and "JPY" not in summary:
        summary = f"{summary} (JPY {payload.amount:,})"

    try:
        event_link = create_calendar_event(
            credentials_path=CREDENTIALS_PATH,
            token_path=TOKEN_PATH,
            title=summary,
            due_date=payload.due_date,
            notes=payload.notes,
            calendar_id=DEFAULT_CALENDAR_ID,
        )
    except Exception as exc:
        logger.exception("Calendar endpoint failed")
        raise HTTPException(status_code=500, detail=f"Calendar creation failed: {exc}") from exc

    return {"event_link": event_link}


async def _read_uploaded_image(file: UploadFile) -> bytes:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Upload an image file.")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    return image_bytes
