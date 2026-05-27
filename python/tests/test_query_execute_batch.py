"""Tests for multi-statement query/execute response shape."""

from sql_studio.models import QueryExecuteResult, StatementResult


def test_query_execute_result_serializes_batch() -> None:
    batch = QueryExecuteResult(
        statements=[
            StatementResult(
                index=1,
                sql="USE robotisation",
                columns=[],
                rows=[],
                row_count=0,
                duration_ms=1.2,
                status_message="Database changed to `robotisation`",
            ),
            StatementResult(
                index=2,
                sql="DROP TABLE IF EXISTS t",
                columns=[],
                rows=[],
                row_count=0,
                duration_ms=3.4,
                status_message="Drop completed",
            ),
        ],
        total_duration_ms=4.6,
    )
    data = batch.model_dump()
    assert len(data["statements"]) == 2
    assert data["statements"][0]["index"] == 1
    assert data["statements"][0]["sql"] == "USE robotisation"
    assert data["total_duration_ms"] == 4.6
