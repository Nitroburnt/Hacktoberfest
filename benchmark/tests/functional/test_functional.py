"""Frozen functional suite (10 tests, 8 points each).

The candidate is imported as `solution`; conftest puts its directory on
sys.path. Every test is deterministic and uses a temp CSV file.
"""

from solution import parse_transactions


def test_f01_single_valid_row(make_csv):
    path = make_csv([{"transaction_id": "t1", "date": "2024-01-02", "amount": "10.50", "description": "coffee"}])
    rows = parse_transactions(path)
    assert len(rows) == 1
    assert rows[0]["transaction_id"] == "t1"


def test_f02_multiple_valid_rows(make_csv):
    path = make_csv(
        [
            {"transaction_id": "t1", "date": "2024-01-02", "amount": "10.50", "description": "coffee"},
            {"transaction_id": "t2", "date": "2024-01-03", "amount": "4.00", "description": "tea"},
            {"transaction_id": "t3", "date": "2024-02-29", "amount": "99.99", "description": "lunch"},
        ]
    )
    rows = parse_transactions(path)
    assert [r["transaction_id"] for r in rows] == ["t1", "t2", "t3"]


def test_f03_duplicate_id_is_dropped(make_csv):
    path = make_csv(
        [
            {"transaction_id": "dup", "date": "2024-01-02", "amount": "1.00", "description": "first"},
            {"transaction_id": "dup", "date": "2024-01-03", "amount": "2.00", "description": "second"},
        ]
    )
    rows = parse_transactions(path)
    assert len(rows) == 1
    assert rows[0]["description"] == "first"


def test_f04_invalid_iso_date_is_skipped(make_csv):
    path = make_csv(
        [
            {"transaction_id": "bad", "date": "2024-13-40", "amount": "1.00", "description": "nope"},
            {"transaction_id": "ok", "date": "2024-12-31", "amount": "2.00", "description": "yes"},
        ]
    )
    rows = parse_transactions(path)
    assert [r["transaction_id"] for r in rows] == ["ok"]


def test_f05_missing_date_is_skipped(make_csv):
    path = make_csv(
        [
            {"transaction_id": "nodate", "date": "", "amount": "1.00", "description": "no date"},
            {"transaction_id": "ok", "date": "2024-05-05", "amount": "2.00", "description": "fine"},
        ]
    )
    rows = parse_transactions(path)
    assert [r["transaction_id"] for r in rows] == ["ok"]


def test_f06_missing_transaction_id_is_skipped(make_csv):
    path = make_csv(
        [
            {"transaction_id": "", "date": "2024-05-05", "amount": "1.00", "description": "no id"},
            {"transaction_id": "ok", "date": "2024-05-06", "amount": "2.00", "description": "fine"},
        ]
    )
    rows = parse_transactions(path)
    assert [r["transaction_id"] for r in rows] == ["ok"]


def test_f07_returns_a_list(make_csv):
    path = make_csv([{"transaction_id": "t1", "date": "2024-01-02", "amount": "1.00", "description": "x"}])
    rows = parse_transactions(path)
    assert isinstance(rows, list)
    assert all(isinstance(r, dict) for r in rows)


def test_f08_preserves_field_content(make_csv):
    path = make_csv(
        [{"transaction_id": "abc-123", "date": "2024-06-15", "amount": "1234.56", "description": "salary June"}]
    )
    rows = parse_transactions(path)
    assert rows[0]["date"] == "2024-06-15"
    assert rows[0]["amount"] == "1234.56"
    assert rows[0]["description"] == "salary June"


def test_f09_empty_file_returns_empty_list(tmp_path):
    path = tmp_path / "empty.csv"
    path.write_text("", encoding="utf-8")
    assert parse_transactions(str(path)) == []


def test_f10_header_only_returns_empty_list(make_csv):
    assert parse_transactions(make_csv([])) == []
