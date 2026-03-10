from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path
from typing import Any

import pandas as pd
from flask import Flask, Response, jsonify, render_template, request, stream_with_context

from app.llm_orchestrator import build_report_with_llm, llm_enabled, plan_visualization_with_llm
from app.profiling import build_column_profiles, column_detail, dataframe_profile
from app.viz_functions import VISUALIZATION_FUNCTIONS, VisualizationInputError

MAX_ROWS = 1_000_000

app = Flask(__name__, template_folder="templates", static_folder="static")
LATEST_DF: pd.DataFrame | None = None
CHAT_TURNS: list[dict[str, str]] = []
CHAT_SUMMARY = ""


def _sanitize_json_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _sanitize_json_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_sanitize_json_value(v) for v in value]
    if isinstance(value, tuple):
        return [_sanitize_json_value(v) for v in value]
    if pd.isna(value):
        return None
    return value


def _clean_records(df: pd.DataFrame, row_limit: int = 20) -> dict[str, Any]:
    preview = df.head(row_limit).copy().astype(object)
    preview = preview.where(pd.notna(preview), None)
    return {
        "columns": [str(c) for c in preview.columns.tolist()],
        "rows": preview.to_dict(orient="records"),
    }


def _pick_columns_from_text(df: pd.DataFrame, message: str) -> list[str]:
    msg = message.lower()
    selected: list[str] = []
    for col in df.columns:
        col_str = str(col)
        if col_str and col_str.lower() in msg:
            selected.append(col_str)
    return selected


def _infer_function_name(message: str) -> str:
    msg = message.lower()
    if "散布図付きヒートマップ" in message or "scatter heatmap" in msg:
        return "scatter_heatmap"
    if "相関ヒートマップ" in message or ("相関" in message and "ヒートマップ" in message):
        return "correlation_heatmap"
    if "バイオリン" in message or "violin" in msg:
        return "violin_plot"
    if "時系列" in message or "推移" in message or "time series" in msg:
        return "timeseries_plot"
    if "散布図" in message or "scatter" in msg:
        return "two_variable_correlation_scatter"
    return "correlation_heatmap"


def _choose_args(df: pd.DataFrame, function_name: str, message: str) -> dict[str, Any]:
    selected = _pick_columns_from_text(df, message)
    numeric_cols = [str(c) for c in df.select_dtypes(include="number").columns.tolist()]
    datetime_cols = [str(c) for c in df.select_dtypes(include="datetime").columns.tolist()]
    categorical_cols = [str(c) for c in df.select_dtypes(exclude="number").columns.tolist()]

    if function_name == "two_variable_correlation_scatter":
        candidates = [c for c in selected if c in numeric_cols] or numeric_cols
        if len(candidates) < 2:
            raise VisualizationInputError("散布図には数値列が2つ以上必要です。")
        return {"x_col": candidates[0], "y_col": candidates[1]}

    if function_name == "correlation_heatmap":
        candidates = [c for c in selected if c in numeric_cols] or numeric_cols
        if len(candidates) < 2:
            raise VisualizationInputError("相関ヒートマップには数値列が2つ以上必要です。")
        return {"columns": candidates[:10]}

    if function_name == "scatter_heatmap":
        candidates = [c for c in selected if c in numeric_cols] or numeric_cols
        if len(candidates) < 2:
            raise VisualizationInputError("散布図付きヒートマップには数値列が2つ以上必要です。")
        return {"x_col": candidates[0], "y_col": candidates[1]}

    if function_name == "violin_plot":
        value_col = next((c for c in selected if c in numeric_cols), None)
        value_col = value_col or (numeric_cols[0] if numeric_cols else None)
        if not value_col:
            raise VisualizationInputError("バイオリンプロットには数値列が必要です。")
        group_col = next((c for c in selected if c != value_col and c in categorical_cols), None)
        return {"value_col": value_col, "group_col": group_col}

    if function_name == "timeseries_plot":
        time_col = next((c for c in selected if c in datetime_cols), None)
        if not time_col and not datetime_cols:
            for col in df.columns:
                try:
                    parsed = pd.to_datetime(df[col], errors="coerce")
                    if parsed.notna().sum() >= max(3, int(len(df) * 0.2)):
                        time_col = str(col)
                        break
                except Exception:
                    continue
        elif not time_col and datetime_cols:
            time_col = datetime_cols[0]

        y_candidates = [c for c in selected if c in numeric_cols]
        if not y_candidates:
            y_candidates = numeric_cols
        if not time_col or not y_candidates:
            raise VisualizationInputError("時系列プロットには time_col と数値列が必要です。")
        y_col = y_candidates[0]
        y2_col = y_candidates[1] if len(y_candidates) > 1 else None
        hue_col = next((c for c in selected if c in categorical_cols and c != time_col), None)
        return {"time_col": time_col, "y_col": y_col, "y2_col": y2_col, "hue_col": hue_col}

    return {}


def _build_report(function_name: str, payload: dict[str, Any]) -> str:
    meta = payload.get("meta", {})
    if function_name == "two_variable_correlation_scatter":
        corr = meta.get("correlation")
        corr_text = "算出不可" if corr is None else f"{corr:.3f}"
        return f"{meta.get('x_col')} と {meta.get('y_col')} の散布図を作成しました。相関係数は {corr_text} です。"
    if function_name == "correlation_heatmap":
        return f"{meta.get('method')} 相関のヒートマップを作成しました。対象列数は {len(meta.get('columns', []))} です。"
    if function_name == "scatter_heatmap":
        return (
            f"{meta.get('x_col')} と {meta.get('y_col')} の散布図+密度ヒートマップを作成しました。"
            f" 全{meta.get('total_points')}点を集計しています。"
        )
    if function_name == "violin_plot":
        return (
            f"{meta.get('value_col')} のバイオリンプロットを作成しました。"
            f" グループ数は {meta.get('groups')}、表示点数は {meta.get('points')} です。"
        )
    if function_name == "timeseries_plot":
        return (
            f"{meta.get('time_col')} を時系列軸として描画しました。"
            f" トレース数は {meta.get('traces')}、集計関数は {meta.get('agg')} です。"
        )
    return "可視化を作成しました。"


def _append_chat_turn(user_message: str, assistant_message: str) -> None:
    CHAT_TURNS.append({"user": user_message, "assistant": assistant_message})
    if len(CHAT_TURNS) > 12:
        del CHAT_TURNS[:-12]


def _refresh_chat_summary() -> None:
    global CHAT_SUMMARY
    parts: list[str] = []
    for turn in CHAT_TURNS[-6:]:
        user = turn.get("user", "").replace("\n", " ")[:80]
        assistant = turn.get("assistant", "").replace("\n", " ")[:120]
        parts.append(f"U:{user} / A:{assistant}")
    CHAT_SUMMARY = " | ".join(parts)


def _should_skip_llm(message: str, df: pd.DataFrame) -> bool:
    selected_cols = _pick_columns_from_text(df, message)
    if len(selected_cols) >= 2 and any(
        kw in message.lower() for kw in ["散布図", "scatter", "相関", "ヒートマップ", "violin", "時系列", "推移"]
    ):
        return True
    return False


def _iter_report_chunks(text: str, chunk_size: int = 10) -> list[str]:
    if not text:
        return []
    return [text[i : i + chunk_size] for i in range(0, len(text), chunk_size)]


def _stream_chat_response(
    *,
    function_name: str,
    function_args: dict[str, Any],
    planner_source: str,
    report: str,
    result: dict[str, Any],
) -> Any:
    def _generate() -> Any:
        yield (
            json.dumps(
                {
                    "type": "meta",
                    "function_name": function_name,
                    "function_args": function_args,
                    "planner_source": planner_source,
                    "result": result,
                },
                ensure_ascii=False,
            )
            + "\n"
        )
        for chunk in _iter_report_chunks(report):
            yield json.dumps({"type": "report_chunk", "chunk": chunk}, ensure_ascii=False) + "\n"
        yield json.dumps({"type": "done"}, ensure_ascii=False) + "\n"

    return stream_with_context(_generate())


def _read_uploaded_dataframe(
    file_bytes: bytes,
    filename: str,
    delimiter: str,
    encoding: str,
) -> pd.DataFrame:
    ext = Path(filename).suffix.lower()
    buffer = BytesIO(file_bytes)
    if ext == ".csv":
        return pd.read_csv(buffer, sep=delimiter, encoding=encoding, nrows=MAX_ROWS)
    if ext in {".parquet", ".pq"}:
        return pd.read_parquet(buffer).head(MAX_ROWS)
    if ext in {".pkl", ".pickle"}:
        loaded = pd.read_pickle(buffer)
        if isinstance(loaded, pd.DataFrame):
            return loaded.head(MAX_ROWS)
        if isinstance(loaded, pd.Series):
            return loaded.to_frame().head(MAX_ROWS)
        raise ValueError("pkl/pickleの中身がDataFrame/Seriesではありません。")
    raise ValueError("未対応の拡張子です。csv / parquet / pkl を利用してください。")


@app.get("/")
def index() -> str:
    return render_template("index.html")


@app.post("/api/profile")
def profile() -> tuple[Any, int] | Any:
    global LATEST_DF
    uploaded_file = request.files.get("file")
    if uploaded_file is None:
        return jsonify({"error": "ファイルが指定されていません。"}), 400

    delimiter = request.form.get("delimiter", ",")
    encoding = request.form.get("encoding", "utf-8")

    try:
        file_bytes = uploaded_file.read()
        df = _read_uploaded_dataframe(
            file_bytes=file_bytes,
            filename=uploaded_file.filename or "",
            delimiter=delimiter,
            encoding=encoding,
        )
    except Exception as exc:
        return jsonify({"error": f"ファイルの読み込みに失敗しました: {exc}"}), 400

    if df.empty:
        return jsonify({"error": "データが空です。"}), 400

    profile_summary = dataframe_profile(df)
    column_profiles = [vars(c) for c in build_column_profiles(df)]
    column_details = {str(col): column_detail(df[col]) for col in df.columns}
    preview = _clean_records(df, row_limit=20)
    LATEST_DF = df.copy()

    payload = _sanitize_json_value(
        {
            "profile": profile_summary,
            "column_profiles": column_profiles,
            "column_details": column_details,
            "preview": preview,
        }
    )
    return jsonify(payload)


@app.post("/api/chat-visualize")
def chat_visualize() -> tuple[Any, int] | Any:
    if LATEST_DF is None:
        return jsonify({"error": "先にEDAタブでデータを分析してください。"}), 400

    body = request.get_json(silent=True) or {}
    message = str(body.get("message", "")).strip()
    stream_mode = bool(body.get("stream"))
    if not message:
        return jsonify({"error": "message が空です。"}), 400

    try:
        planner_source = "rule"
        function_name = ""
        function_args: dict[str, Any] = {}

        if llm_enabled() and not _should_skip_llm(message, LATEST_DF):
            try:
                plan = plan_visualization_with_llm(
                    df=LATEST_DF,
                    user_message=message,
                    conversation_summary=CHAT_SUMMARY,
                    turns=CHAT_TURNS,
                )
                function_name = plan["function_name"]
                function_args = plan["args"]
                planner_source = plan.get("source", "llm")
            except Exception:
                planner_source = "rule-fallback"

        if not function_name:
            function_name = _infer_function_name(message)
            function_args = _choose_args(LATEST_DF, function_name, message)

        try:
            payload = VISUALIZATION_FUNCTIONS[function_name](LATEST_DF, **function_args)
        except VisualizationInputError:
            if planner_source.startswith("llm"):
                function_name = _infer_function_name(message)
                function_args = _choose_args(LATEST_DF, function_name, message)
                payload = VISUALIZATION_FUNCTIONS[function_name](LATEST_DF, **function_args)
                planner_source = "rule-fallback"
            else:
                raise

        if llm_enabled():
            try:
                report = build_report_with_llm(
                    user_message=message,
                    function_name=function_name,
                    function_args=function_args,
                    result_payload=payload,
                    conversation_summary=CHAT_SUMMARY,
                    turns=CHAT_TURNS,
                )
            except Exception:
                report = _build_report(function_name, payload)
        else:
            report = _build_report(function_name, payload)

        _append_chat_turn(message, report)
        _refresh_chat_summary()
    except VisualizationInputError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": f"可視化の実行に失敗しました: {exc}"}), 500

    sanitized_result = _sanitize_json_value(payload)
    if stream_mode:
        return Response(
            _stream_chat_response(
                function_name=function_name,
                function_args=function_args,
                planner_source=planner_source,
                report=report,
                result=sanitized_result,
            ),
            mimetype="application/x-ndjson",
            headers={"X-Accel-Buffering": "no"},
        )

    return jsonify(
        {
            "function_name": function_name,
            "function_args": function_args,
            "planner_source": planner_source,
            "report": report,
            "result": sanitized_result,
        }
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
