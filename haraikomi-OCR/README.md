<div id="top"></div>

## 使用技術一覧

<p style="display: inline">
  <img src="https://img.shields.io/badge/-Python-3776AB.svg?logo=python&style=for-the-badge&logoColor=white">
  <img src="https://img.shields.io/badge/-FastAPI-009688.svg?logo=fastapi&style=for-the-badge&logoColor=white">
  <img src="https://img.shields.io/badge/-Uvicorn-499848.svg?style=for-the-badge">
  <img src="https://img.shields.io/badge/-Yomitoku-1A1A1A.svg?style=for-the-badge">
  <img src="https://img.shields.io/badge/-Google%20Calendar%20API-4285F4.svg?logo=googlecalendar&style=for-the-badge&logoColor=white">
  <img src="https://img.shields.io/badge/-Docker-2496ED.svg?logo=docker&style=for-the-badge&logoColor=white">
</p>

## 目次

1. [プロジェクトについて](#プロジェクトについて)
2. [環境](#環境)
3. [ディレクトリ構成](#ディレクトリ構成)
4. [開発環境構築](#開発環境構築)
5. [トラブルシューティング](#トラブルシューティング)

## プロジェクト名

haraikomi-OCR

## プロジェクトについて

`haraikomi-OCR` は、払込票画像を OCR で解析し、抽出した支払期限や金額を確認・修正して Google カレンダーへリマインダー登録するローカル向け MVP アプリです。

### 主な機能

- 画像アップロード（ブラウザ UI）
- Yomitoku `DocumentAnalyzer` による OCR 実行
- 処理時間・生テキスト・構造化 payload の確認
- 支払期限 / 金額 / タイトル候補の自動抽出
- フォーム修正後に Google カレンダーへイベント作成

### API エンドポイント

- `POST /api/ocr`: 画像を解析し、抽出結果を返却
- `POST /api/calendar`: Google カレンダーへイベント作成

<p align="right">(<a href="#top">トップへ</a>)</p>

## 環境

| 言語・フレームワーク | バージョン |
| -------------------- | ---------- |
| Python               | 3.11 系（Docker イメージ: `python:3.11-slim`） |
| FastAPI              | 0.115.0 以上 |
| Uvicorn              | 0.34.0 以上 |
| yomitoku             | 0.7.0 以上 |
| google-api-python-client | 2.165.0 以上 |
| google-auth-oauthlib | 1.2.0 以上 |
| Docker Compose       | 任意（ローカル Docker 環境に依存） |

詳細は `requirements.txt` を参照してください。

<p align="right">(<a href="#top">トップへ</a>)</p>

## ディレクトリ構成

```text
.
├── .cache
├── .dockerignore
├── .gitignore
├── Dockerfile
├── README.md
├── README_forlocal.md
├── app.py
├── credentials.json
├── docker-compose.yml
├── haraikomi_ocr
│   ├── __init__.py
│   ├── calendar_client.py
│   ├── models.py
│   ├── ocr.py
│   └── parser.py
├── requirements.txt
├── scripts
│   └── bootstrap_google_token.py
├── static
│   ├── app.js
│   ├── index.html
│   ├── styles.css
│   └── styles_plain.css
└── token.json
```

<p align="right">(<a href="#top">トップへ</a>)</p>

## 開発環境構築

### 1. 事前準備

- Docker / Docker Compose
- Google Cloud プロジェクト（Google Calendar API を有効化）
- OAuth クライアント認証情報（`credentials.json`）

`credentials.json` をプロジェクトルートに配置します。

```bash
cp /path/to/your/google-oauth-client.json ./credentials.json
```

### 2. アプリ起動

```bash
cd /home/kohei/WorkSpace/projects/haraikomi-OCR
docker compose up --build
```

起動後、`http://localhost:8000` にアクセスしてください。

### 3. Google 認証（初回のみ）

コンテナ内から OAuth フローを実行し、`token.json` を生成します。

```bash
docker compose run --rm --service-ports app python scripts/bootstrap_google_token.py
```

- ターミナルに表示される URL をブラウザで開いてログイン
- 認証完了後、プロジェクトルートに `token.json` が保存されます
- OAuth コールバック用に `8080` ポートを使用します

### 4. 停止

```bash
docker compose down
```

### 5. 補足

- 初回 OCR 実行時に Yomitoku モデルがダウンロードされます（`./.cache` に保存）。
- `docker-compose.yml` で `./.cache:/app/.cache` をマウントしているため、再起動後もキャッシュを再利用します。
- 生成されるイベントは `Asia/Tokyo` の 13:00-13:30、30 分前のポップアップ通知 1 件です。
- パーサはヒューリスティックベースのため、カレンダー登録前にフォーム内容を確認してください。

<p align="right">(<a href="#top">トップへ</a>)</p>

## トラブルシューティング

- `Missing credentials.json` エラー:
  - ルートに `credentials.json` を配置し、コンテナを再起動してください。
- `Missing token.json` エラー:
  - `docker compose run --rm --service-ports app python scripts/bootstrap_google_token.py` を実行してください。
- OAuth の戻り先で失敗する場合:
  - `8080` ポートが使用中でないか確認してください。
- OCR が遅い場合:
  - 初回モデルダウンロード完了後に再実行し、`./.cache` が永続化されているか確認してください。

<p align="right">(<a href="#top">トップへ</a>)</p>
