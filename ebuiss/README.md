<div id="top"></div>

## 使用技術一覧

<p style="display: inline">
  <img src="https://img.shields.io/badge/-Python-3776AB.svg?logo=python&style=for-the-badge&logoColor=white">
  <img src="https://img.shields.io/badge/-pandas-150458.svg?logo=pandas&style=for-the-badge">
  <img src="https://img.shields.io/badge/-NumPy-013243.svg?logo=numpy&style=for-the-badge">
  <img src="https://img.shields.io/badge/-Plotly-3F4F75.svg?logo=plotly&style=for-the-badge">
</p>

## 目次

1. [プロジェクトについて](#プロジェクトについて)
2. [環境](#環境)
3. [ディレクトリ構成](#ディレクトリ構成)
4. [開発環境構築](#開発環境構築)
5. [トラブルシューティング](#トラブルシューティング)

## プロジェクト名

ebuiss

## プロジェクトについて

`ebuiss` は、株式取引戦略のバックテスト、評価、可視化を行う Python ライブラリです。  
価格データとファクターデータを登録し、戦略を動的に読み込んでロング/ショートの成績を検証できます。

### 主な機能

- 価格データ・ファクターデータの登録 (`EbuissDB`)
- 戦略ファイルの登録・読み込み (`StrategyDriver`)
- バックテスト実行 (`Backtester`)
- 指標評価（累積リターン、年率リターン、MaxDD など） (`Evaluator`)
- セグメント別パフォーマンス可視化 (`Visualizer`)
- 一括実行ラッパー (`Admin.Ebuiss_admin.Ebuiss`)

<p align="right">(<a href="#top">トップへ</a>)</p>

## 環境

| 言語・ライブラリ | バージョン |
| ---------------- | ---------- |
| Python           | 3.10+ 推奨 |
| pandas           | プロジェクト依存 |
| numpy            | プロジェクト依存 |
| plotly           | プロジェクト依存 |
| IPython          | 任意（`display` 利用時） |

このリポジトリには `requirements.txt` がないため、必要パッケージは手動でインストールしてください。

<p align="right">(<a href="#top">トップへ</a>)</p>

## ディレクトリ構成

```text
.
├── Admin
│   └── Ebuiss_admin.py
├── README.md
├── README_forlocal.md
├── __init__.py
├── backtester
│   └── backtester.py
├── ebuissdb
│   └── ebuissdb.py
├── evaluator
│   └── evaluator.py
├── hisui
│   ├── hisuiframe.py
│   └── hisuistore.py
├── strategy
│   ├── quantile_strategy.py
│   ├── strategy.py
│   └── test_strategy_5q.py
├── strategy_driver
│   └── strategy_driver.py
└── visualizer
    └── visualizer.py
```

<p align="right">(<a href="#top">トップへ</a>)</p>

## 開発環境構築

### 1. 仮想環境作成

```bash
cd /home/kohei/WorkSpace/projects/ebuiss
python3 -m venv .venv
source .venv/bin/activate
pip install pandas numpy plotly ipython
```

### 2. 利用例

```python
import pandas as pd
from ebuiss import Ebuiss

# 価格データ（index=date, columns=ticker）
price_df = pd.DataFrame(...)

# ファクターデータ（index=[ticker, date] の MultiIndex, columns=[factor列]）
factor_df = pd.DataFrame(...)

admin = Ebuiss()
admin.register_df(price_df, "price_sample")
admin.register_factors(factor_df, "alpha")

# strategy/test_strategy_5q.py などを利用
trade_log, metrics, chart = admin.run(
    strategy_name="test_strategy_5q",
    price_name="price_sample",
    factor_name="alpha_factor1",  # 登録した列名に応じて指定
    cumulative=True,
    exe_cost=0.001,
    initial_cash=1_000_000,
)
```

### 3. 戦略追加

外部戦略を登録する場合:

```python
admin.register_strategy("/path/to/your_strategy.py", "my_strategy")
print(admin.list_strategies())
```

- 戦略クラスは `strategy/strategy.py` の `Strategy` を継承し、`generate_positions` を実装してください。

<p align="right">(<a href="#top">トップへ</a>)</p>

## トラブルシューティング

- `factor_df is required` エラー:
  - ファクター依存戦略では `factor_name` を指定してください。
- `price_dfとfactor_dfに共通する銘柄が存在しません。`:
  - 価格データとファクターの列（ticker）を揃えてください。
- 戦略読み込みエラー (`指定された戦略ファイルが存在しません`):
  - `strategy` フォルダに `strategy_name.py` があるか確認してください。
- import エラー:
  - `/home/kohei/WorkSpace/projects` 配下から実行し、`ebuiss` パッケージを import できる状態にしてください。

<p align="right">(<a href="#top">トップへ</a>)</p>
