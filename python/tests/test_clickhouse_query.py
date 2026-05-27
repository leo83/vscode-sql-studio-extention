"""Tests for ClickHouse tabular result building."""

from sql_studio.drivers.clickhouse_query import build_query_result, normalize_column_names


def test_normalize_column_names_from_row_width() -> None:
    assert normalize_column_names([], [[1]]) == ["column_1"]


def test_normalize_column_names_fills_blanks() -> None:
    assert normalize_column_names(["", "count"], [[1, 2]]) == ["column_1", "count"]


def test_build_query_result_select_one_without_column_names() -> None:
    result = build_query_result(
        sql="SELECT 1",
        column_names=[],
        column_types=None,
        rows=[[1]],
        duration_ms=12.5,
        limit=10_000,
        status_for_empty=lambda _: "should not use",
    )
    assert result.columns[0].name == "column_1"
    assert result.rows == [[1]]
    assert result.row_count == 1
    assert result.status_message is None


def test_build_query_result_status_when_empty() -> None:
    result = build_query_result(
        sql="CREATE TABLE t (x UInt8)",
        column_names=[],
        column_types=None,
        rows=[],
        duration_ms=1.0,
        limit=100,
        status_for_empty=lambda _: "Create completed",
    )
    assert result.columns == []
    assert result.rows == []
    assert result.status_message == "Create completed"
