"""One connection, one query at a time — and a cancel that says so."""

from __future__ import annotations

import threading
from typing import Any
from unittest.mock import patch

from sql_studio.drivers.registry import _CANCELLED, _DRIVERS
from sql_studio.models import QueryResult
from sql_studio.server import JsonRpcServer


def _connection() -> dict[str, Any]:
    return {
        "id": "conn-1",
        "dialect": "clickhouse",
        "host": "localhost",
        "port": 9000,
        "database": "default",
        "username": "default",
        "password": "",
    }


def _execute_request(req_id: int) -> dict[str, Any]:
    return {
        "id": req_id,
        "method": "query/execute",
        "params": {"connection": _connection(), "sql": "SELECT 1"},
    }


def setup_function() -> None:
    _DRIVERS.clear()
    _CANCELLED.clear()


def teardown_function() -> None:
    # The fakes below are not real drivers; leaving them pooled breaks other tests.
    _DRIVERS.clear()
    _CANCELLED.clear()


class _SlowDriver:
    """Driver that reports whether two queries were ever in flight together."""

    def __init__(self) -> None:
        self.running = 0
        self.max_running = 0
        self._guard = threading.Lock()

    def execute(self, sql: str, limit: int | None = None) -> QueryResult:
        with self._guard:
            self.running += 1
            self.max_running = max(self.max_running, self.running)
        try:
            threading.Event().wait(0.05)
            return QueryResult(columns=[], rows=[], row_count=0, duration_ms=1.0)
        finally:
            with self._guard:
                self.running -= 1


def test_queries_on_one_connection_are_serialized() -> None:
    driver = _SlowDriver()
    server = JsonRpcServer()
    with patch("sql_studio.server.get_driver", return_value=driver):
        threads = [
            threading.Thread(target=server._handle, args=(_execute_request(i),))
            for i in range(1, 4)
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(5)

    assert driver.max_running == 1


class _CancelledDriver:
    """Driver that fails the way a client library does on a dropped socket."""

    def __init__(self) -> None:
        self.started = threading.Event()
        self.released = threading.Event()

    def execute(self, sql: str, limit: int | None = None) -> QueryResult:
        self.started.set()
        self.released.wait(5)
        raise AttributeError("'NoneType' object has no attribute 'close'")

    def cancel_query(self) -> None:
        self.released.set()


def test_cancel_reports_a_cancel_not_a_query_failure() -> None:
    driver = _CancelledDriver()
    _DRIVERS["conn-1"] = driver  # type: ignore[assignment]
    server = JsonRpcServer()
    response: dict[str, Any] = {}

    with patch("sql_studio.server.get_driver", return_value=driver):
        def run() -> None:
            response.update(server._handle(_execute_request(1)))

        worker = threading.Thread(target=run)
        worker.start()
        assert driver.started.wait(5)
        cancel = server._handle(
            {"id": 2, "method": "query/cancel", "params": {"connectionId": "conn-1"}}
        )
        worker.join(5)

    assert cancel["result"] == {"ok": True}
    assert response["error"]["code"] == -32001
    assert response["error"]["message"] == "Query cancelled"
    assert not _CANCELLED
