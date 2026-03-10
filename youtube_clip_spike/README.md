<div id="top"></div>

## 使用技術一覧

<p style="display: inline">
  <img src="https://img.shields.io/badge/-Python-3776AB.svg?logo=python&style=for-the-badge&logoColor=white">
  <img src="https://img.shields.io/badge/-Flask-000000.svg?logo=flask&style=for-the-badge">
  <img src="https://img.shields.io/badge/-Gunicorn-499848.svg?logo=gunicorn&style=for-the-badge&logoColor=white">
  <img src="https://img.shields.io/badge/-Redis-DC382D.svg?logo=redis&style=for-the-badge&logoColor=white">
  <img src="https://img.shields.io/badge/-RQ-CB3837.svg?style=for-the-badge&logo=python&logoColor=white">
  <img src="https://img.shields.io/badge/-Chart.js-FF6384.svg?logo=chartdotjs&style=for-the-badge&logoColor=white">
  <img src="https://img.shields.io/badge/-yt--dlp-111111.svg?style=for-the-badge">
  <img src="https://img.shields.io/badge/-faster--whisper-1F2937.svg?style=for-the-badge">
  <img src="https://img.shields.io/badge/-pyannote.audio-0EA5E9.svg?style=for-the-badge">
  <img src="https://img.shields.io/badge/-Docker-2496ED.svg?logo=docker&style=for-the-badge&logoColor=white">
</p>

## 目次

1. [プロジェクトについて](#プロジェクトについて)
2. [環境](#環境)
3. [ディレクトリ構成](#ディレクトリ構成)
4. [開発環境構築](#開発環境構築)
5. [トラブルシューティング](#トラブルシューティング)

## プロジェクト名

youtube_clip_spike

## プロジェクトについて

`youtube_clip_spike` は、YouTube 配信のコメントを時系列で解析し、CPS（Comments Per Second）のスパイク地点を可視化・抽出する Flask アプリです。抽出したスパイク時点をそのまま切り抜き動画として保存できます。

### 主な機能

- 配信 URL からコメントを取得して非同期解析（Redis + RQ）
- 全コメントとキーワード別のスパイクグラフ表示
- スパイク候補の「視聴」「追加」操作
- 追加スパイクごとの切り抜き保存（ZIP ダウンロード）
- 任意で話者分離付き文字起こし (`video_transcript.txt`) を同梱

### 主な API エンドポイント

- `POST /analyze/start` : 解析ジョブ開始
- `GET /analyze/status/<job_id>` : 解析進捗/結果取得
- `POST /analyze/recompute/<job_id>` : キーワード再計算
- `GET /api/video-info` : 元動画情報取得
- `POST /api/clips/download` : 切り抜き ZIP 生成

<p align="right">(<a href="#top">トップへ</a>)</p>

## 環境

| 言語・フレームワーク | バージョン |
| -------------------- | ---------- |
| Python               | 3.11 系（Docker イメージ: `python:3.11-slim`） |
| Flask                | 3.0.0 以上 |
| gunicorn             | 21.2 以上 |
| redis                | 5.0 以上 |
| rq                   | 1.15 以上 |
| chat-downloader      | 0.2.7 以上 |
| yt-dlp               | 2025.1.0 以上 |
| faster-whisper       | 1.1.1 以上 |
| pyannote.audio       | 3.3.2 以上 |
| Docker Compose       | v2 系推奨 |

詳細な依存関係は `requirements.txt` を参照してください。

<p align="right">(<a href="#top">トップへ</a>)</p>

## ディレクトリ構成

```text
.
├── .env
├── Dockerfile
├── README.md
├── README_forlocal.md
├── app
│   ├── __init__.py
│   ├── config.py
│   ├── job_utils.py
│   ├── routes.py
│   ├── worker.py
│   ├── services
│   │   ├── analysis_pipeline.py
│   │   ├── chat_loader.py
│   │   ├── clip_downloader.py
│   │   ├── cps_analyzer.py
│   │   ├── message_cache.py
│   │   ├── spike_detector.py
│   │   ├── transcript_service.py
│   │   └── youtube_api.py
│   ├── static
│   │   ├── css
│   │   ├── images
│   │   └── js
│   └── templates
│       └── index.html
├── config
│   └── settings.yaml
├── docker-compose.yml
├── docker-compose.dev.yml
├── requirements.txt
├── sample
├── scripts
└── tests
```

<p align="right">(<a href="#top">トップへ</a>)</p>

## 開発環境構築

### 1. 環境変数を用意

`.env` に必要な設定を記述します。

```env
YOUTUBE_API_KEY=your_youtube_data_api_key
CLIP_TRANSCRIPT_ENABLED=false
CLIP_DIARIZATION_ENABLED=true
HUGGINGFACE_TOKEN=
GUNICORN_TIMEOUT=600
```

### 2. コンテナ起動（通常）

```bash
cd /home/kohei/WorkSpace/projects/youtube_clip_spike
docker compose up --build
```

- `web` : Flask + Gunicorn（`127.0.0.1:5002` 公開）
- `worker` : RQ Worker（`analysis` キュー）
- `redis` : ジョブキュー/メタデータ保存

ブラウザで `http://localhost:5002` にアクセスします。

### 3. コンテナ起動（開発ホットリロード）

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

- `web` は `--reload` 有効
- `worker` もバインドマウントでコード変更を参照
- `worker` への変更反映は `docker compose restart worker` を実行

### 4. 切り抜き保存と文字起こし

- 切り抜きは `yt-dlp --download-sections` + `ffmpeg` で生成
- サーバー一時領域は既定で `/tmp/youtube_clip_spike`（`CLIP_OUTPUT_DIR` で変更）
- 返却形式は ZIP のみ（レスポンス後に一時ファイルを削除）
- 話者分離付き文字起こしを有効化する場合:
  - `CLIP_TRANSCRIPT_ENABLED=true`
  - `CLIP_DIARIZATION_ENABLED=true`
  - `HUGGINGFACE_TOKEN`（`pyannote/speaker-diarization-3.1` 利用時）

### 5. 主要設定値

`config/settings.yaml` の値は環境変数で上書きできます。

| 変数名 | 役割 | 既定値 |
| ------ | ---- | ------ |
| `REDIS_URL` | Redis 接続先 | `redis://redis:6379/0` |
| `REDIS_QUEUE_NAME` | RQ キュー名 | `analysis` |
| `REDIS_JOB_TIMEOUT` | ジョブタイムアウト秒 | `900` |
| `REDIS_RESULT_TTL` | 結果保持秒 | `86400` |
| `SPIKE_MIN_PROMINENCE` | スパイク抽出閾値 | `2.0` |
| `SPIKE_MIN_GAP_SECONDS` | 最小スパイク間隔 | `10` |
| `CLIP_PARALLEL_FRAGMENTS` | yt-dlp 並列フラグメント数 | `24` |
| `GUNICORN_TIMEOUT` | リクエストタイムアウト秒 | `600` |

<p align="right">(<a href="#top">トップへ</a>)</p>

## トラブルシューティング

- `YOUTUBE_API_KEY` 未設定エラー:
  - `.env` に API キーを設定してコンテナを再起動してください。
- ジョブが進まない / `queued` のまま:
  - `worker` コンテナが起動しているか確認してください。
- 切り抜き保存に失敗する:
  - `yt-dlp` / `ffmpeg` 実行ログを確認し、対象 URL が有効か確認してください。
- 長い動画でタイムアウトする:
  - `GUNICORN_TIMEOUT` を増やしてください。
- 話者分離が動かない:
  - `CLIP_TRANSCRIPT_ENABLED=true` と `HUGGINGFACE_TOKEN` の設定を確認してください。

<p align="right">(<a href="#top">トップへ</a>)</p>
