"""Visualization helper functions for chat-driven BI workflows.

These functions build Plotly figures and return JSON-serializable payloads.
"""

from __future__ import annotations

from copy import deepcopy
import json
from typing import Any, Callable

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from plotly.utils import PlotlyJSONEncoder

from app.viz_defaults import VISUALIZATION_DEFAULT_ARGS

ALLOWED_CORR_METHODS = {"pearson", "spearman", "kendall"}
ALLOWED_AGG = {"mean", "sum", "min", "max", "median", "count"}


class VisualizationInputError(ValueError):
    """Raised when visualization input columns or args are invalid."""


def _validate_column(df: pd.DataFrame, col: str | None, arg_name: str) -> str:
    if not col:
        raise VisualizationInputError(f"{arg_name} is required")
    if col not in df.columns:
        raise VisualizationInputError(f"column not found: {col}")
    return col


def _apply_defaults(function_name: str, overrides: dict[str, Any]) -> dict[str, Any]:
    params = deepcopy(VISUALIZATION_DEFAULT_ARGS[function_name])
    params.update({k: v for k, v in overrides.items() if v is not None})
    return params


def _serialize_figure(fig: go.Figure) -> dict[str, Any]:
    return json.loads(json.dumps(fig, cls=PlotlyJSONEncoder))


def two_variable_correlation_scatter(
    df: pd.DataFrame,
    *,
    x_col: str | None = None,
    y_col: str | None = None,
    sample_n: int | None = None,
    dropna: bool | None = None,
) -> dict[str, Any]:
    params = _apply_defaults(
        "two_variable_correlation_scatter",
        {
            "x_col": x_col,
            "y_col": y_col,
            "sample_n": sample_n,
            "dropna": dropna,
        },
    )

    x_name = _validate_column(df, params["x_col"], "x_col")
    y_name = _validate_column(df, params["y_col"], "y_col")

    data = df[[x_name, y_name]].copy()
    if params["dropna"]:
        data = data.dropna(subset=[x_name, y_name])

    data[x_name] = pd.to_numeric(data[x_name], errors="coerce")
    data[y_name] = pd.to_numeric(data[y_name], errors="coerce")
    data = data.dropna(subset=[x_name, y_name])

    if params["sample_n"] and len(data) > int(params["sample_n"]):
        data = data.sample(n=int(params["sample_n"]), random_state=42)

    corr = None
    if len(data) >= 2:
        corr = float(data[x_name].corr(data[y_name]))

    corr_text = f" (corr={corr:.3f})" if corr is not None else ""
    fig = px.scatter(
        data,
        x=x_name,
        y=y_name,
        title=f"Correlation Scatter: {x_name} vs {y_name}{corr_text}",
        opacity=0.7,
    )
    fig.update_layout(template="plotly_white")

    return {
        "chart_type": "scatter",
        "function": "two_variable_correlation_scatter",
        "params": params,
        "meta": {
            "x_col": x_name,
            "y_col": y_name,
            "points": int(len(data)),
            "correlation": corr,
        },
        "figure": _serialize_figure(fig),
    }


def correlation_heatmap(
    df: pd.DataFrame,
    *,
    columns: list[str] | None = None,
    method: str | None = None,
    min_periods: int | None = None,
    round_digits: int | None = None,
) -> dict[str, Any]:
    params = _apply_defaults(
        "correlation_heatmap",
        {
            "columns": columns,
            "method": method,
            "min_periods": min_periods,
            "round_digits": round_digits,
        },
    )

    corr_method = str(params["method"]).lower()
    if corr_method not in ALLOWED_CORR_METHODS:
        raise VisualizationInputError(f"method must be one of {sorted(ALLOWED_CORR_METHODS)}")

    numeric_df = df.select_dtypes(include=[np.number]).copy()
    if params["columns"]:
        unknown = [c for c in params["columns"] if c not in numeric_df.columns]
        if unknown:
            raise VisualizationInputError(f"columns are not numeric or not found: {unknown}")
        numeric_df = numeric_df[params["columns"]]

    if numeric_df.shape[1] < 2:
        raise VisualizationInputError("at least two numeric columns are required")

    matrix = numeric_df.corr(method=corr_method, min_periods=int(params["min_periods"]))
    matrix = matrix.round(int(params["round_digits"]))
    col_count = int(matrix.shape[1])
    show_cell_text = col_count <= 24

    fig = go.Figure(
        data=go.Heatmap(
            z=matrix.values,
            x=matrix.columns.tolist(),
            y=matrix.index.tolist(),
            zmin=-1,
            zmax=1,
            colorscale="RdBu",
            zmid=0,
            text=matrix.values,
            texttemplate="%{text:.2f}" if show_cell_text else None,
            hovertemplate="x=%{x}<br>y=%{y}<br>corr=%{z}<extra></extra>",
        )
    )
    plot_width = max(820, min(2200, 180 + col_count * 44))
    plot_height = max(520, min(1400, 220 + col_count * 24))
    fig.update_layout(
        title=f"Correlation Heatmap ({corr_method})",
        template="plotly_white",
        xaxis_title="Columns",
        yaxis_title="Columns",
        width=plot_width,
        height=plot_height,
        margin=dict(l=130, r=40, t=72, b=170),
    )
    fig.update_xaxes(tickangle=-45, automargin=True)
    fig.update_yaxes(automargin=True)

    return {
        "chart_type": "heatmap",
        "function": "correlation_heatmap",
        "params": params,
        "meta": {
            "columns": [str(c) for c in matrix.columns.tolist()],
            "method": corr_method,
        },
        "figure": _serialize_figure(fig),
    }


def scatter_heatmap(
    df: pd.DataFrame,
    *,
    x_col: str | None = None,
    y_col: str | None = None,
    bins: int | None = None,
    sample_n: int | None = None,
    dropna: bool | None = None,
) -> dict[str, Any]:
    params = _apply_defaults(
        "scatter_heatmap",
        {
            "x_col": x_col,
            "y_col": y_col,
            "bins": bins,
            "sample_n": sample_n,
            "dropna": dropna,
        },
    )

    x_name = _validate_column(df, params["x_col"], "x_col")
    y_name = _validate_column(df, params["y_col"], "y_col")

    data = df[[x_name, y_name]].copy()
    if params["dropna"]:
        data = data.dropna(subset=[x_name, y_name])

    data[x_name] = pd.to_numeric(data[x_name], errors="coerce")
    data[y_name] = pd.to_numeric(data[y_name], errors="coerce")
    data = data.dropna(subset=[x_name, y_name])

    if data.empty:
        raise VisualizationInputError("no valid numeric pairs for scatter_heatmap")

    scatter_data = data
    if params["sample_n"] and len(scatter_data) > int(params["sample_n"]):
        scatter_data = scatter_data.sample(n=int(params["sample_n"]), random_state=42)

    fig = make_subplots(
        rows=1,
        cols=2,
        subplot_titles=("2D Density Heatmap", "Scatter"),
        horizontal_spacing=0.12,
    )

    fig.add_trace(
        go.Histogram2d(
            x=data[x_name],
            y=data[y_name],
            nbinsx=int(params["bins"]),
            nbinsy=int(params["bins"]),
            colorscale="Blues",
            colorbar=dict(title="count"),
            hovertemplate=f"{x_name}=%{{x}}<br>{y_name}=%{{y}}<br>count=%{{z}}<extra></extra>",
        ),
        row=1,
        col=1,
    )

    fig.add_trace(
        go.Scattergl(
            x=scatter_data[x_name],
            y=scatter_data[y_name],
            mode="markers",
            marker=dict(size=5, opacity=0.6),
            name="samples",
            hovertemplate=f"{x_name}=%{{x}}<br>{y_name}=%{{y}}<extra></extra>",
        ),
        row=1,
        col=2,
    )

    fig.update_layout(
        title=f"Scatter + Heatmap: {x_name} vs {y_name}",
        template="plotly_white",
        showlegend=False,
    )
    fig.update_xaxes(title_text=x_name, row=1, col=1)
    fig.update_yaxes(title_text=y_name, row=1, col=1)
    fig.update_xaxes(title_text=x_name, row=1, col=2)
    fig.update_yaxes(title_text=y_name, row=1, col=2)

    return {
        "chart_type": "scatter_heatmap",
        "function": "scatter_heatmap",
        "params": params,
        "meta": {
            "x_col": x_name,
            "y_col": y_name,
            "total_points": int(len(data)),
            "scatter_points": int(len(scatter_data)),
        },
        "figure": _serialize_figure(fig),
    }


def violin_plot(
    df: pd.DataFrame,
    *,
    value_col: str | None = None,
    group_col: str | None = None,
    sample_n: int | None = None,
    dropna: bool | None = None,
) -> dict[str, Any]:
    params = _apply_defaults(
        "violin_plot",
        {
            "value_col": value_col,
            "group_col": group_col,
            "sample_n": sample_n,
            "dropna": dropna,
        },
    )

    value_name = _validate_column(df, params["value_col"], "value_col")
    group_name = params["group_col"]
    if group_name and group_name not in df.columns:
        raise VisualizationInputError(f"column not found: {group_name}")

    work_cols = [value_name] + ([group_name] if group_name else [])
    data = df[work_cols].copy()
    data[value_name] = pd.to_numeric(data[value_name], errors="coerce")

    if params["dropna"]:
        drop_cols = [value_name] + ([group_name] if group_name else [])
        data = data.dropna(subset=drop_cols)

    data = data.dropna(subset=[value_name])
    if data.empty:
        raise VisualizationInputError("no data available for violin plot")

    if params["sample_n"] and len(data) > int(params["sample_n"]):
        data = data.sample(n=int(params["sample_n"]), random_state=42)

    if group_name:
        fig = px.violin(
            data,
            x=group_name,
            y=value_name,
            box=True,
            points="outliers",
            title=f"Violin Plot: {value_name} by {group_name}",
        )
        group_count = int(data[group_name].nunique(dropna=False))
    else:
        fig = go.Figure(
            data=go.Violin(
                y=data[value_name],
                box_visible=True,
                meanline_visible=True,
                points="outliers",
                name=value_name,
            )
        )
        fig.update_layout(title=f"Violin Plot: {value_name}")
        group_count = 1

    fig.update_layout(template="plotly_white")

    return {
        "chart_type": "violin",
        "function": "violin_plot",
        "params": params,
        "meta": {
            "value_col": value_name,
            "group_col": group_name,
            "groups": group_count,
            "points": int(len(data)),
        },
        "figure": _serialize_figure(fig),
    }


def timeseries_plot(
    df: pd.DataFrame,
    *,
    time_col: str | None = None,
    y_col: str | None = None,
    y2_col: str | None = None,
    hue_col: str | None = None,
    freq: str | None = None,
    agg: str | None = None,
    dropna: bool | None = None,
    point_limit: int | None = None,
) -> dict[str, Any]:
    params = _apply_defaults(
        "timeseries_plot",
        {
            "time_col": time_col,
            "y_col": y_col,
            "y2_col": y2_col,
            "hue_col": hue_col,
            "freq": freq,
            "agg": agg,
            "dropna": dropna,
            "point_limit": point_limit,
        },
    )

    time_name = _validate_column(df, params["time_col"], "time_col")
    y1_name = _validate_column(df, params["y_col"], "y_col")

    y2_name = params["y2_col"]
    if y2_name and y2_name not in df.columns:
        raise VisualizationInputError(f"column not found: {y2_name}")

    hue_name = params["hue_col"]
    if hue_name and hue_name not in df.columns:
        raise VisualizationInputError(f"column not found: {hue_name}")

    agg_name = str(params["agg"]).lower()
    if agg_name not in ALLOWED_AGG:
        raise VisualizationInputError(f"agg must be one of {sorted(ALLOWED_AGG)}")

    value_cols = [y1_name] + ([y2_name] if y2_name else [])
    work_cols = [time_name] + value_cols + ([hue_name] if hue_name else [])
    data = df[work_cols].copy()

    data[time_name] = pd.to_datetime(data[time_name], errors="coerce")
    for v_col in value_cols:
        data[v_col] = pd.to_numeric(data[v_col], errors="coerce")

    if params["dropna"]:
        drop_cols = [time_name, y1_name]
        data = data.dropna(subset=drop_cols)

    data = data.dropna(subset=[time_name, y1_name])
    if data.empty:
        raise VisualizationInputError("no data available for timeseries")

    group_keys: list[Any] = [
        pd.Grouper(key=time_name, freq=params["freq"]) if params["freq"] else time_name
    ]
    if hue_name:
        group_keys.append(hue_name)

    grouped = data.groupby(group_keys, dropna=False)[value_cols].agg(agg_name).reset_index()
    grouped = grouped.sort_values(by=[time_name])

    if params["point_limit"] and len(grouped) > int(params["point_limit"]):
        grouped = grouped.tail(int(params["point_limit"]))

    fig = make_subplots(specs=[[{"secondary_y": bool(y2_name)}]])

    if hue_name:
        for hue_value, chunk in grouped.groupby(hue_name, dropna=False):
            label = "null" if pd.isna(hue_value) else str(hue_value)
            fig.add_trace(
                go.Scatter(
                    x=chunk[time_name],
                    y=chunk[y1_name],
                    mode="lines+markers",
                    name=f"{y1_name} | {label}",
                ),
                secondary_y=False,
            )
            if y2_name:
                fig.add_trace(
                    go.Scatter(
                        x=chunk[time_name],
                        y=chunk[y2_name],
                        mode="lines+markers",
                        name=f"{y2_name} | {label}",
                    ),
                    secondary_y=True,
                )
    else:
        fig.add_trace(
            go.Scatter(
                x=grouped[time_name],
                y=grouped[y1_name],
                mode="lines+markers",
                name=y1_name,
            ),
            secondary_y=False,
        )
        if y2_name:
            fig.add_trace(
                go.Scatter(
                    x=grouped[time_name],
                    y=grouped[y2_name],
                    mode="lines+markers",
                    name=y2_name,
                ),
                secondary_y=True,
            )

    fig.update_layout(
        title=f"Time Series: {y1_name}" + (f" / {y2_name}" if y2_name else ""),
        template="plotly_white",
        xaxis_title=time_name,
        legend_title="series",
    )
    fig.update_yaxes(title_text=y1_name, secondary_y=False)
    if y2_name:
        fig.update_yaxes(title_text=y2_name, secondary_y=True)

    return {
        "chart_type": "timeseries",
        "function": "timeseries_plot",
        "params": params,
        "meta": {
            "time_col": time_name,
            "y_col": y1_name,
            "y2_col": y2_name,
            "hue_col": hue_name,
            "agg": agg_name,
            "freq": params["freq"],
            "rows": int(len(grouped)),
            "traces": int(len(fig.data)),
        },
        "figure": _serialize_figure(fig),
    }


VISUALIZATION_FUNCTIONS: dict[str, Callable[..., dict[str, Any]]] = {
    "two_variable_correlation_scatter": two_variable_correlation_scatter,
    "correlation_heatmap": correlation_heatmap,
    "scatter_heatmap": scatter_heatmap,
    "violin_plot": violin_plot,
    "timeseries_plot": timeseries_plot,
}


def list_visualization_functions() -> list[str]:
    """Return implemented visualization function names."""
    return sorted(VISUALIZATION_FUNCTIONS.keys())
