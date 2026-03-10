<div id="top"></div>

## 使用技術一覧

<p style="display: inline">
  <img src="https://img.shields.io/badge/-Python-3776AB.svg?logo=python&style=for-the-badge&logoColor=white">
  <img src="https://img.shields.io/badge/-Flask-000000.svg?logo=flask&style=for-the-badge">
  <img src="https://img.shields.io/badge/-Gunicorn-499848.svg?logo=gunicorn&style=for-the-badge&logoColor=white">
  <img src="https://img.shields.io/badge/-JavaScript-F7DF1E.svg?logo=javascript&style=for-the-badge&logoColor=black">
  <img src="https://img.shields.io/badge/-YouTube%20Data%20API-FF0000.svg?logo=youtube&style=for-the-badge&logoColor=white">
  <img src="https://img.shields.io/badge/-Docker-2496ED.svg?logo=docker&style=for-the-badge&logoColor=white">
  <img src="https://img.shields.io/badge/-AWS%20Lightsail-232F3E.svg?logo=amazonaws&style=for-the-badge&logoColor=white">
</p>

## 目次

1. [プロジェクトについて](#プロジェクトについて)
2. [環境](#環境)
3. [ディレクトリ構成](#ディレクトリ構成)
4. [開発環境構築](#開発環境構築)
5. [トラブルシューティング](#トラブルシューティング)

## プロジェクト名

youtube_clip_search

## プロジェクトについて

`youtube_clip_search` は、配信アーカイブ動画の URL から、説明欄に元動画リンク（または動画 ID）を含む切り抜き候補を抽出して一覧化する Flask アプリです。

### 主な機能

- アーカイブ URL を入力して切り抜き候補を検索
- `再生数 / 投稿日 / 動画長` でソート（昇順・降順）
- `動画 / Shorts / お気に入り` タブで表示切替
- 元動画のサマリー（タイトル・再生数・長さなど）を表示
- 日本語ページ / 英語ページを提供

### API エンドポイント

- `GET /api/search?url=<youtube_url>&sort=<views|date|duration>&order=<asc|desc>`

<p align="right">(<a href="#top">トップへ</a>)</p>

## 環境

| 言語・フレームワーク | バージョン |
| -------------------- | ---------- |
| Python               | 3.11 以上（ローカル `.venv` は 3.12 でも動作可） |
| Flask                | 3.0.2 |
| gunicorn             | 21.2.0 |
| requests             | 2.31.0 |
| python-dotenv        | 1.0.1 |
| PyYAML               | 6.0.1 |
| Docker               | 任意（Lightsail/コンテナ実行時） |

依存ライブラリの詳細は `requirements.txt` を参照してください。

<p align="right">(<a href="#top">トップへ</a>)</p>

## ディレクトリ構成

```text
.
├── .dockerignore
├── .env
├── .github
│   └── workflows
├── .gitignore
├── README.md
├── README_forlocal.md
├── app
│   ├── __init__.py
│   ├── config.py
│   ├── routes.py
│   ├── services
│   │   └── youtube_api.py
│   ├── static
│   │   ├── css
│   │   ├── images
│   │   ├── js
│   │   └── sitemap.xml
│   └── templates
│       ├── en
│       ├── index.html
│       ├── about.html
│       ├── terms.html
│       └── privacy.html
├── config
│   ├── lightsail.env
│   └── settings.yaml
├── deploy
│   └── lightsail
│       ├── Dockerfile
│       └── docker-compose.yml
├── requirements.txt
├── sample
└── tests
```

<p align="right">(<a href="#top">トップへ</a>)</p>

## 開発環境構築

### 1. 環境変数の設定

`.env` を作成し、以下を設定します。

```env
YOUTUBE_API_KEY=your_youtube_data_api_key
SEARCH_MAX_RESULTS=50
```

### 2. ローカル起動（Flask）

```bash
cd /home/kohei/WorkSpace/projects/youtube_clip_search
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
FLASK_APP=app flask run
```

起動後、`http://localhost:5000` にアクセスします。

### 3. Docker / Lightsail 用起動

```bash
cd /home/kohei/WorkSpace/projects/youtube_clip_search
docker compose -f deploy/lightsail/docker-compose.yml up --build
```

- コンテナは `gunicorn -b 0.0.0.0:5000 app:create_app()` で起動
- 環境変数は `config/lightsail.env` から読み込み

### 4. 設定値

`app/config.py` は `config/settings.yaml` の値を読み込みつつ、環境変数で上書きします。

| 変数名 | 用途 | デフォルト |
| ------ | ---- | ---------- |
| `YOUTUBE_API_KEY` | YouTube Data API のキー | `config/settings.yaml` の `youtube.api_key` |
| `SEARCH_MAX_RESULTS` | 検索 API の取得件数上限 | `50` |
| `APP_ENV_FILE` | 読み込む env ファイルパス | `.env` |

<p align="right">(<a href="#top">トップへ</a>)</p>

## トラブルシューティング

- `YOUTUBE_API_KEY is not configured.` エラー:
  - `.env` または `config/lightsail.env` に `YOUTUBE_API_KEY` を設定してください。
- 検索結果が 0 件になる:
  - 入力した URL が YouTube 動画 URL であること、説明欄に元動画リンク/IDが含まれる切り抜きが存在することを確認してください。
- `動画IDをURLから抽出できませんでした。` エラー:
  - URL 形式（`watch?v=...` / `youtu.be/...` / `shorts/...`）を確認してください。
- API レートや権限エラー:
  - YouTube Data API の有効化、クォータ残量、キー制限設定を確認してください。

<p align="right">(<a href="#top">トップへ</a>)</p>
