import csv
import os
import sys

import pytest

SOLUTION_DIR = os.environ.get("SOLUTION_DIR")
if SOLUTION_DIR:
    sys.path.insert(0, SOLUTION_DIR)

HEADER = ["transaction_id", "date", "amount", "description"]


@pytest.fixture()
def make_csv(tmp_path):
    """Write a CSV file and return its path."""

    def _make(rows, header=HEADER, name="transactions.csv"):
        path = tmp_path / name
        with open(path, "w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=header, extrasaction="ignore")
            writer.writeheader()
            for row in rows:
                writer.writerow(row)
        return str(path)

    return _make
