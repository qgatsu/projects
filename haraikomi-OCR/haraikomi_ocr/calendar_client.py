from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/calendar.events"]


def create_calendar_event(
    credentials_path: Path,
    token_path: Path,
    title: str,
    due_date,
    notes: str,
    calendar_id: str = "primary",
) -> str:
    """Create a fixed 13:00-13:30 event with one popup reminder 30 minutes before."""
    creds = _load_credentials(credentials_path, token_path)
    service = build("calendar", "v3", credentials=creds)

    jst = timezone(timedelta(hours=9))
    start_at = datetime.combine(due_date, time(hour=13, minute=0), tzinfo=jst)
    end_at = datetime.combine(due_date, time(hour=13, minute=30), tzinfo=jst)

    event = {
        "summary": title,
        "description": notes,
        "start": {"dateTime": start_at.isoformat(), "timeZone": "Asia/Tokyo"},
        "end": {"dateTime": end_at.isoformat(), "timeZone": "Asia/Tokyo"},
        "reminders": {
            "useDefault": False,
            "overrides": [{"method": "popup", "minutes": 30}],
        },
    }

    created = service.events().insert(calendarId=calendar_id, body=event).execute()
    return created.get("htmlLink", "")


def bootstrap_google_token(
    credentials_path: Path,
    token_path: Path,
    host: str = "localhost",
    bind_addr: str = "0.0.0.0",
    port: int = 8080,
) -> None:
    """Run the OAuth flow explicitly for container-based local development."""
    flow = InstalledAppFlow.from_client_secrets_file(str(credentials_path), SCOPES)
    creds = flow.run_local_server(
        host=host,
        bind_addr=bind_addr,
        port=port,
        open_browser=False,
    )
    token_path.write_text(creds.to_json(), encoding="utf-8")


def _load_credentials(credentials_path: Path, token_path: Path) -> Credentials:
    creds = None

    if token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            raise FileNotFoundError("Missing token.json. Run scripts/bootstrap_google_token.py first.")

        token_path.write_text(creds.to_json(), encoding="utf-8")

    return creds
