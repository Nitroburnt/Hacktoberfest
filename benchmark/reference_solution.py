"""Reference solution for the frozen CSV transaction importer task.

Passes all 10 functional + 5 edge tests and earns the full 5 static points.
This file is the 100/100 oracle for Phase 0 T0.2.
"""

from __future__ import annotations

import csv
import warnings
from datetime import datetime
from typing import Any

REQUIRED_FIELDS = ("transaction_id", "date")


def parse_transactions(csv_path: str) -> list[dict[str, Any]]:
    """Parse a transactions CSV, returning only validated, deduplicated rows."""
    cleaned: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    with open(csv_path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for line_number, raw in enumerate(reader, start=2):
            row = {
                key: (value.strip() if isinstance(value, str) else value)
                for key, value in raw.items()
            }
            transaction_id = (row.get("transaction_id") or "").strip()
            if not transaction_id:
                warnings.warn(f"row {line_number}: missing transaction_id, skipped")
                continue
            if transaction_id in seen_ids:
                continue
            date_value = (row.get("date") or "").strip()
            try:
                datetime.strptime(date_value, "%Y-%m-%d")
            except ValueError:
                warnings.warn(
                    f"row {line_number}: invalid date {date_value!r}, skipped"
                )
                continue
            try:
                float(row.get("amount") or "0")
            except ValueError:
                warnings.warn(f"row {line_number}: non-numeric amount, skipped")
                continue
            seen_ids.add(transaction_id)
            cleaned.append(row)

    return cleaned
