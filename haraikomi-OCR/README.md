# haraikomi-OCR

Local MVP app for turning a payment slip image into a Google Calendar reminder.

## What it does

1. Open a local browser UI built with HTML, CSS, and vanilla JavaScript.
2. Run Yomitoku `DocumentAnalyzer` on the image.
3. Inspect the processing time, raw text, and JSON structure.
4. Use the extracted due date and amount as the draft values.
5. Let you correct the fields and create a Google Calendar event with popup reminders.

## Prerequisites

- Docker and Docker Compose
- A Google Cloud project with the Google Calendar API enabled
- OAuth client credentials downloaded as `credentials.json`

## Setup

```bash
cp /path/to/your/google-oauth-client.json ./credentials.json
```

## Start the app

```bash
docker compose up --build
```

The browser UI will be available at:

```bash
http://localhost:8000
```

## Google authentication

Because the app runs in a container, generate `token.json` once before creating events:

```bash
docker compose run --rm --service-ports app python scripts/bootstrap_google_token.py
```

This starts a temporary OAuth callback server on port `8080`. Open the URL printed in the terminal, complete the Google login, and `token.json` will be written into the project directory.

## Files used at runtime

```bash
./credentials.json
./token.json
```

## Notes

- Yomitoku downloads model weights on first use. The compose file mounts a local cache directory so they are reused.
- The parser is still heuristic-based. You should expect to review and correct fields before creating the reminder.
- If OCR is slow on CPU, you can tune Yomitoku settings later, but this scaffold keeps the default CPU-safe setup.
- The frontend is static files in `./static`, served by the FastAPI backend in `app.py`.
- The main OCR flow calls `/api/ocr`, which runs `DocumentAnalyzer` and returns its payload for inspection.
