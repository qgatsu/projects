from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pandas as pd


@dataclass
class ColumnProfile:
    name: str
    inferred_type: str
    non_null_count: int
    null_count: int
    null_rate: float
    unique_count: int
    sample: str


def _try_parse_datetime(series: pd.Series, sample_size: int = 2000) -> float:
    non_null = series.dropna()
    if non_null.empty:
        return 0.0
    sampled = non_null.head(sample_size)
    parsed = pd.to_datetime(sampled, errors="coerce", format="mixed")
    return float(parsed.notna().mean())


def infer_column_type(series: pd.Series) -> str:
    if pd.api.types.is_bool_dtype(series):
        return "boolean"
    if pd.api.types.is_numeric_dtype(series):
        return "numeric"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"

    non_null = series.dropna()
    if non_null.empty:
        return "text"

    unique_values = set(non_null.astype(str).str.lower().unique().tolist())
    if unique_values.issubset({"true", "false", "0", "1", "yes", "no"}):
        return "boolean"

    datetime_ratio = _try_parse_datetime(series)
    if datetime_ratio >= 0.8:
        return "datetime"

    unique_count = non_null.nunique(dropna=True)
    cardinality_ratio = unique_count / max(len(non_null), 1)
    if unique_count <= 50 or cardinality_ratio <= 0.05:
        return "categorical"

    return "text"


def build_column_profiles(df: pd.DataFrame) -> list[ColumnProfile]:
    profiles: list[ColumnProfile] = []
    for col in df.columns:
        series = df[col]
        non_null_count = int(series.notna().sum())
        null_count = int(series.isna().sum())
        inferred_type = infer_column_type(series)
        sample_vals = series.dropna().astype(str).head(3).tolist()
        sample = ", ".join(sample_vals) if sample_vals else "-"
        profiles.append(
            ColumnProfile(
                name=str(col),
                inferred_type=inferred_type,
                non_null_count=non_null_count,
                null_count=null_count,
                null_rate=float(null_count / len(df)) if len(df) else 0.0,
                unique_count=int(series.nunique(dropna=True)),
                sample=sample,
            )
        )
    return profiles


def numeric_stats(series: pd.Series) -> dict[str, Any]:
    numeric = pd.to_numeric(series, errors="coerce")
    stats = numeric.describe(percentiles=[0.25, 0.5, 0.75]).to_dict()
    mode_values = numeric.mode(dropna=True)
    mode_value = mode_values.iloc[0] if not mode_values.empty else None
    return {
        "count": int(stats.get("count", 0)),
        "mean": float(stats.get("mean")) if pd.notna(stats.get("mean")) else None,
        "std": float(stats.get("std")) if pd.notna(stats.get("std")) else None,
        "min": float(stats.get("min")) if pd.notna(stats.get("min")) else None,
        "p25": float(stats.get("25%")) if pd.notna(stats.get("25%")) else None,
        "median": float(stats.get("50%")) if pd.notna(stats.get("50%")) else None,
        "p75": float(stats.get("75%")) if pd.notna(stats.get("75%")) else None,
        "max": float(stats.get("max")) if pd.notna(stats.get("max")) else None,
        "mode": float(mode_value) if pd.notna(mode_value) else None,
    }


def categorical_stats(series: pd.Series, top_k: int = 10) -> dict[str, Any]:
    non_null = series.dropna().astype(str)
    vc = non_null.value_counts().head(top_k)
    mode_value = None
    if not vc.empty:
        mode_value = str(vc.index[0])
    return {
        "count": int(non_null.shape[0]),
        "unique_count": int(non_null.nunique()),
        "mode": mode_value,
        "top_values": [{"value": k, "count": int(v)} for k, v in vc.to_dict().items()],
    }


def datetime_stats(series: pd.Series) -> dict[str, Any]:
    parsed = pd.to_datetime(series, errors="coerce", format="mixed")
    non_null = parsed.dropna()
    if non_null.empty:
        return {
            "count": 0,
            "min": None,
            "max": None,
            "median": None,
            "mode": None,
            "range_days": None,
        }

    min_val = non_null.min()
    max_val = non_null.max()
    median_val = non_null.sort_values().iloc[len(non_null) // 2]
    mode_values = non_null.mode(dropna=True)
    mode_val = mode_values.iloc[0] if not mode_values.empty else None
    return {
        "count": int(non_null.shape[0]),
        "min": min_val.isoformat(),
        "max": max_val.isoformat(),
        "median": median_val.isoformat(),
        "mode": mode_val.isoformat() if mode_val is not None else None,
        "range_days": int((max_val - min_val).days),
    }


def dataframe_profile(df: pd.DataFrame) -> dict[str, Any]:
    column_profiles = build_column_profiles(df)
    global_nulls = int(df.isna().sum().sum())
    total_cells = int(df.shape[0] * df.shape[1]) if df.shape[1] else 0

    return {
        "rows": int(df.shape[0]),
        "columns": int(df.shape[1]),
        "global_null_rate": float(global_nulls / total_cells) if total_cells else 0.0,
        "column_profiles": [vars(c) for c in column_profiles],
    }


def _safe_json_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _safe_json_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_safe_json_value(v) for v in value]
    if isinstance(value, tuple):
        return [_safe_json_value(v) for v in value]
    if pd.isna(value):
        return None
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    return value


def distribution_for_column(series: pd.Series, inferred_type: str) -> list[dict[str, Any]]:
    if inferred_type == "numeric":
        numeric = pd.to_numeric(series, errors="coerce").dropna()
        if numeric.empty:
            return []
        bins = pd.cut(numeric, bins=24, include_lowest=True)
        counts = bins.value_counts(sort=False)
        return [
            {"bucket": str(interval), "count": int(count)}
            for interval, count in counts.to_dict().items()
        ]
    if inferred_type in {"categorical", "boolean"}:
        non_null = series.dropna().astype(str)
        vc = non_null.value_counts().head(20)
        return [{"bucket": str(k), "count": int(v)} for k, v in vc.to_dict().items()]
    if inferred_type == "datetime":
        parsed = pd.to_datetime(series, errors="coerce", format="mixed").dropna()
        if parsed.empty:
            return []
        day_counts = parsed.dt.date.value_counts().sort_index()
        return [{"bucket": str(day), "count": int(v)} for day, v in day_counts.to_dict().items()]

    text_len = series.dropna().astype(str).str.len()
    if text_len.empty:
        return []
    bins = pd.cut(text_len, bins=16, include_lowest=True)
    counts = bins.value_counts(sort=False)
    return [{"bucket": str(interval), "count": int(v)} for interval, v in counts.to_dict().items()]


def column_detail(series: pd.Series) -> dict[str, Any]:
    inferred_type = infer_column_type(series)
    if inferred_type == "numeric":
        stats = numeric_stats(series)
    elif inferred_type == "categorical":
        stats = categorical_stats(series)
    elif inferred_type == "datetime":
        stats = datetime_stats(series)
    elif inferred_type == "boolean":
        stats = categorical_stats(series.astype(str).str.lower())
    else:
        text_series = series.dropna().astype(str)
        stats = {
            "count": int(text_series.shape[0]),
            "avg_length": float(text_series.str.len().mean()) if not text_series.empty else None,
            "max_length": int(text_series.str.len().max()) if not text_series.empty else None,
            "sample_values": text_series.head(10).tolist(),
        }

    return _safe_json_value(
        {
            "inferred_type": inferred_type,
            "stats": stats,
            "distribution": distribution_for_column(series, inferred_type),
        }
    )
