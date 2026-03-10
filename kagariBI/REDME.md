<div id="top"></div>

## 使用技術一覧

<p style="display: inline">
  <img src="https://img.shields.io/badge/-Python-3776AB.svg?logo=python&style=for-the-badge&logoColor=white">
  <img src="https://img.shields.io/badge/-Flask-000000.svg?logo=flask&style=for-the-badge">
  <img src="https://img.shields.io/badge/-Pandas-150458.svg?logo=pandas&style=for-the-badge">
  <img src="https://img.shields.io/badge/-NumPy-013243.svg?logo=numpy&style=for-the-badge">
  <img src="https://img.shields.io/badge/-PyArrow-FFCC00.svg?style=for-the-badge&logo=apachearrow&logoColor=black">
  <img src="https://img.shields.io/badge/-Plotly-3F4F75.svg?logo=plotly&style=for-the-badge">
  <img src="https://img.shields.io/badge/-OpenAI-412991.svg?logo=openai&style=for-the-badge">
  <img src="https://img.shields.io/badge/-Docker-2496ED.svg?logo=docker&style=for-the-badge&logoColor=white">
</p>

## 目次

1. [プロジェクトについて](#プロジェクトについて)
2. [環境](#環境)
3. [ディレクトリ構成](#ディレクトリ構成)
4. [開発環境構築](#開発環境構築)
5. [トラブルシューティング](#トラブルシューティング)

## プロジェクト名

kagariBI

## プロジェクトについて

`kagariBI` は、CSV / Parquet / PKL をアップロードして、表形式データの簡易 EDA をブラウザ上で行う Flask アプリです。

### 主な機能

- CSV / Parquet / PKL のアップロード
- 列型推定（numeric / categorical / datetime / boolean / text）
- 列サマリを「縦=統計量、横=列」のテーブル形式で表示
- 先頭行に列ごとの分布ヒストグラム表示
- `max / min / median / mode` を含む統計量表示
- 先頭 20 行のプレビュー表示

### チャット可視化向け内部関数

- 実装: `app/viz_functions.py`
- デフォルト引数定義: `app/viz_defaults.py`

<p align="right">(<a href="#top">トップへ</a>)</p>

## 環境

| 言語・フレームワーク | バージョン |
| -------------------- | ---------- |
| Python               | 3.12 系（Docker イメージ: `python:3.12-slim`） |
| Flask                | 3.1.0 以上 |
| pandas               | 2.2.0 以上 |
| pyarrow              | 16.0.0 以上 |
| numpy                | 1.26.0 以上 |
| plotly               | 5.24.0 以上 |
| openai               | 1.52.0 以上 |
| Docker Compose       | 任意（ローカルの Docker 環境に依存） |

詳細な依存パッケージは `requirements.txt` を参照してください。

<p align="right">(<a href="#top">トップへ</a>)</p>

## ディレクトリ構成

```text
.
├── .dockerignore
├── .env
├── Dockerfile
├── README_forlocal.md
├── REDME.md
├── app
│   ├── __init__.py
│   ├── llm_orchestrator.py
│   ├── main.py
│   ├── profiling.py
│   ├── static
│   │   ├── css
│   │   ├── img
│   │   └── js
│   ├── templates
│   │   └── index.html
│   ├── viz_defaults.py
│   ├── viz_function_reference.txt
│   └── viz_functions.py
├── docker-compose.yml
└── requirements.txt
```

<p align="right">(<a href="#top">トップへ</a>)</p>

## 開発環境構築

### 1. Docker での起動（推奨）

プロジェクトルートで以下を実行します。

```bash
cd /home/kohei/WorkSpace/projects/kagariBI
docker compose up --build
```

起動後、`http://localhost:8000` にアクセスしてください。

2 回目以降（依存関係変更なし）は以下で起動できます。

```bash
docker compose up
```

停止する場合:

```bash
docker compose down
```

### 2. ローカル実行（Docker なし）

```bash
cd /home/kohei/WorkSpace/projects/kagariBI
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m app.main
```

### 3. 環境変数

`.env` に以下を設定してください。

| 変数名 | 役割 | 例 |
| ------ | ---- | -- |
| `OPENAI_API_KEY` | OpenAI API キー | `sk-...` |
| `OPENAI_PLANNER_MODEL` | プランナー用モデル | `gpt-4o-mini` |
| `OPENAI_REPORT_MODEL` | レポート生成用モデル | `gpt-4o-mini` |

API キー未設定時は、LLM 連携機能が利用できず、ルールベース処理のみ動作します。

### 4. 補足

- `app/` はボリュームマウントされるため、`*.py` / `templates` / `static` の変更は再ビルドなしで反映されます。
- `requirements.txt` を変更した場合のみ `docker compose up --build` を実行してください。
- `pkl/pickle` は任意コード実行リスクがあるため、信頼できるファイルのみ扱ってください。
- MVP 制約として、入力形式は `csv / parquet / pkl`、読み込み行数上限は 1,000,000 行です。

<p align="right">(<a href="#top">トップへ</a>)</p>

## トラブルシューティング

- ポート `8000` が使用中の場合:
  - `docker-compose.yml` の `ports` を変更するか、使用中プロセスを停止してください。
- 依存関係エラーが出る場合:
  - `docker compose up --build` で再ビルドしてください。
- `.env` 設定後に反映されない場合:
  - `docker compose down` 後に `docker compose up --build` を実行してください。

<p align="right">(<a href="#top">トップへ</a>)</p>
