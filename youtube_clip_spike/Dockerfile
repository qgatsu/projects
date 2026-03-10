FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg aria2 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app

RUN python - <<'PY'
from pathlib import Path
import chat_downloader
src = Path("/app/sample/youtube.py")
dst = Path(chat_downloader.__file__).resolve().parent / "sites" / "youtube.py"
dst.write_text(src.read_text())
print(f"Patched chat_downloader youtube module at {dst}")
PY

EXPOSE 5000

CMD ["bash", "-lc", "gunicorn -b 0.0.0.0:5000 --timeout ${GUNICORN_TIMEOUT:-600} 'app:create_app()'"]
