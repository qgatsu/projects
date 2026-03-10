"""Default arguments for chat-driven visualization functions."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

VISUALIZATION_DEFAULT_ARGS: dict[str, dict[str, Any]] = {
    "two_variable_correlation_scatter": {
        "x_col": None,
        "y_col": None,
        "sample_n": 3000,
        "dropna": True,
    },
    "correlation_heatmap": {
        "columns": None,
        "method": "pearson",
        "min_periods": 1,
        "round_digits": 4,
    },
    "scatter_heatmap": {
        "x_col": None,
        "y_col": None,
        "bins": 30,
        "sample_n": 2000,
        "dropna": True,
    },
    "violin_plot": {
        "value_col": None,
        "group_col": None,
        "sample_n": 800,
        "dropna": True,
    },
    "timeseries_plot": {
        "time_col": None,
        "y_col": None,
        "y2_col": None,
        "hue_col": None,
        "freq": None,
        "agg": "mean",
        "dropna": True,
        "point_limit": 1500,
    },
}


def get_default_args(function_name: str) -> dict[str, Any]:
    """Return default args for a single visualization function."""
    if function_name not in VISUALIZATION_DEFAULT_ARGS:
        raise KeyError(f"Unknown function: {function_name}")
    return deepcopy(VISUALIZATION_DEFAULT_ARGS[function_name])


def get_all_default_args() -> dict[str, dict[str, Any]]:
    """Return default args for all visualization functions."""
    return deepcopy(VISUALIZATION_DEFAULT_ARGS)
