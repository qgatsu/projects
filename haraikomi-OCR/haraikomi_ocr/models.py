from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass
class PaymentInfo:
    due_date: date | None
    amount: int | None
    title: str
    notes: str
    raw_text: str
