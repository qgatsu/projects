# kagariBI

機能1: 表形式データの簡易EDAビューア（HTML/CSS/JSフロントエンド）。

## できること
- CSV / Parquet / PKLアップロード
- 列型推定（numeric / categorical / datetime / boolean / text）
- 列サマリを「縦=統計量、横=列」のテーブル形式で表示
- 先頭行に列ごとの分布ヒストグラム表示
- `max / min / median / mode` を含む統計量表示
- 先頭20行プレビュー表示

## チャット可視化向け内部関数
- 実装: `app/viz_functions.py`
- デフォルト引数定義: `app/viz_defaults.py`

## セットアップ（Docker）
```bash
cd /home/kohei/WorkSpace/projects/kagariBI
docker compose up --build
```

起動後: `http://localhost:8000`

`app/` はボリュームマウントされるため、`*.py`, `templates`, `static` の変更はコンテナ再ビルドなしで反映されます。
依存関係（`requirements.txt`）を変更したときだけ `--build` が必要です。

## 開発時の起動（2回目以降）
```bash
docker compose up
```

## 停止
```bash
docker compose down
```

## ローカル実行（Dockerを使わない場合）
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m app.main
```

## LLM設定
- `.env` に `OPENAI_API_KEY` を設定してください（マスク済みテンプレートを配置済み）。
- モデルは `OPENAI_PLANNER_MODEL` / `OPENAI_REPORT_MODEL` で変更できます。
- APIキー未設定時は、ルールベースのみで動作します。

## 制約（MVP）
- 入力は `csv / parquet / pkl`
- 読み込み行数上限: 1,000,000行

## 注意
- `pkl/pickle` は任意コード実行リスクがあるため、信頼できるファイルのみ扱ってください。
