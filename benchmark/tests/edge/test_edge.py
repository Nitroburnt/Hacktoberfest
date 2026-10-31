"""Frozen edge-case suite (5 tests, 3 points each)."""

from solution import parse_transactions


def test_e01_duplicate_keeps_first_record(make_csv):
    path = make_csv(
        [
            {"transaction_id": "dup", "date": "2024-01-02", "amount": "1.00", "description": "keep"},
            {"transaction_id": "dup", "date": "2024-07-02", "amount": "9.00", "description": "drop"},
            {"transaction_id": "dup", "date": "2024-08-02", "amount": "9.00", "description": "drop too"},
        ]
    )
    rows = parse_transactions(path)
    assert len(rows) == 1
    assert rows[0]["amount"] == "1.00"


def test_e02_non_iso_date_is_skipped(make_csv):
    path = make_csv(
        [
            {"transaction_id": "us", "date": "01/02/2024", "amount": "1.00", "description": "mdy"},
            {"transaction_id": "iso", "date": "2024-01-02", "amount": "2.00", "description": "ok"},
        ]
    )
    rows = parse_transactions(path)
    assert [r["transaction_id"] for r in rows] == ["iso"]


def test_e03_extra_columns_are_tolerated(make_csv):
    header = ["transaction_id", "date", "amount", "description", "memo"]
    path = make_csv(
        [
            {
                "transaction_id": "t1",
                "date": "2024-03-03",
                "amount": "3.00",
                "description": "with memo",
                "memo": "extra-field",
            }
        ],
        header=header,
    )
    rows = parse_transactions(path)
    assert len(rows) == 1
    assert rows[0]["memo"] == "extra-field"


def test_e04_whitespace_is_normalized(make_csv):
    path = make_csv(
        [
            {
                "transaction_id": "  t1  ",
                "date": " 2024-02-03 ",
                "amount": " 5.00 ",
                "description": "  padded  ",
            }
        ]
    )
    rows = parse_transactions(path)
    assert len(rows) == 1
    assert rows[0]["transaction_id"] == "t1"
    assert rows[0]["date"] == "2024-02-03"
    assert rows[0]["amount"] == "5.00"


def test_e05_quoted_commas_are_parsed(make_csv):
    path = make_csv(
        [{"transaction_id": "t1", "date": "2024-04-04", "amount": "8.25", "description": "Coffee, large"}]
    )
    rows = parse_transactions(path)
    assert len(rows) == 1
    assert rows[0]["description"] == "Coffee, large"
