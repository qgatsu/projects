"""LLM planner/reporter for chat-driven visualization."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pandas as pd
from openai import OpenAI

from app.viz_defaults import get_all_default_args
from app.viz_functions import VISUALIZATION_FUNCTIONS

PLANNER_MODEL = os.getenv("OPENAI_PLANNER_MODEL", "gpt-4o-mini")
REPORT_MODEL = os.getenv("OPENAI_REPORT_MODEL", "gpt-4o-mini")


def llm_enabled() -> bool:
    return bool(os.getenv("OPENAI_API_KEY"))


def _client() -> OpenAI:
    return OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def _load_function_reference() -> str:
    path = Path(__file__).resolve().parent / "viz_function_reference.txt"
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        return ""


def _schema_snapshot(df: pd.DataFrame) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for col in df.columns:
        s = df[col]
        rows.append(
            {
                "name": str(col),
                "dtype": str(s.dtype),
            }
        )
    return rows


def _recent_context(turns: list[dict[str, str]], limit: int = 2) -> list[dict[str, str]]:
    return turns[-limit:] if turns else []


def plan_visualization_with_llm(
    *,
    df: pd.DataFrame,
    user_message: str,
    conversation_summary: str,
    turns: list[dict[str, str]],
) -> dict[str, Any]:
    if not llm_enabled():
        raise RuntimeError("OPENAI_API_KEY is not set")

    system_prompt = (
        "You are a function planner for BI visualization. "
        "Choose exactly one function and safe arguments from provided columns. "
        "Output strict JSON only with keys: function_name, args, confidence."
    )

    input_payload = {
        "user_message": user_message,
        "conversation_summary": conversation_summary,
        "recent_turns": _recent_context(turns),
        "function_reference": _load_function_reference(),
        "function_defaults": get_all_default_args(),
        "available_functions": sorted(VISUALIZATION_FUNCTIONS.keys()),
        "data_schema": _schema_snapshot(df),
    }

    resp = _client().chat.completions.create(
        model=PLANNER_MODEL,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(input_payload, ensure_ascii=False)},
        ],
    )
    content = resp.choices[0].message.content or "{}"
    parsed = json.loads(content)

    function_name = str(parsed.get("function_name", "")).strip()
    args = parsed.get("args", {})
    confidence = float(parsed.get("confidence", 0.0))

    if function_name not in VISUALIZATION_FUNCTIONS:
        raise ValueError(f"unknown function from LLM: {function_name}")
    if not isinstance(args, dict):
        raise ValueError("args must be dict")

    return {
        "function_name": function_name,
        "args": args,
        "confidence": confidence,
        "source": "llm",
    }


def build_report_with_llm(
    *,
    user_message: str,
    function_name: str,
    function_args: dict[str, Any],
    result_payload: dict[str, Any],
    conversation_summary: str,
    turns: list[dict[str, str]],
) -> str:
    if not llm_enabled():
        raise RuntimeError("OPENAI_API_KEY is not set")

    system_prompt = (
        "You are a concise BI analyst. "
        "Write a short report in Japanese in 2-4 sentences. "
        "Focus on what was visualized and key numerical hints from metadata."
    )

    input_payload = {
        "user_message": user_message,
        "conversation_summary": conversation_summary,
        "recent_turns": _recent_context(turns),
        "function_name": function_name,
        "function_args": function_args,
        "meta": result_payload.get("meta", {}),
    }

    resp = _client().chat.completions.create(
        model=REPORT_MODEL,
        temperature=0.2,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(input_payload, ensure_ascii=False)},
        ],
    )
    content = (resp.choices[0].message.content or "").strip()
    if not content:
        raise ValueError("empty report from LLM")
    return content
