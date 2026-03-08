from __future__ import annotations

from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from haraikomi_ocr.calendar_client import bootstrap_google_token


def main() -> None:
    credentials_path = PROJECT_ROOT / "credentials.json"
    token_path = PROJECT_ROOT / "token.json"

    if not credentials_path.exists():
        raise FileNotFoundError("Missing credentials.json in the project root.")

    bootstrap_google_token(
        credentials_path=credentials_path,
        token_path=token_path,
        host="localhost",
        bind_addr="0.0.0.0",
        port=8080,
    )


if __name__ == "__main__":
    main()
