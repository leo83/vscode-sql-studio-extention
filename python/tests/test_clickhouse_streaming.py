"""ClickHouse drivers must bound what they pull for a result grid."""

from __future__ import annotations

from typing import Any, Iterator
from unittest.mock import MagicMock, patch

import pytest
from clickhouse_driver import errors as native_errors

from sql_studio.drivers.clickhouse_http import ClickHouseHttpDriver
from sql_studio.drivers.clickhouse_native import ClickHouseNativeDriver
from sql_studio.models import ConnectionConfig


def _config(port: int) -> ConnectionConfig:
    return ConnectionConfig(
        id="ch-1",
        dialect="clickhouse",
        host="localhost",
        port=port,
        database="default",
        username="default",
        password="",
    )


class _Response:
    """urllib3 response stand-in: draining an open response reads the rest."""

    def __init__(self) -> None:
        self.closed = False
        self.drained = False

    def close(self) -> None:
        self.closed = True

    def drain_conn(self) -> None:
        if not self.closed:
            self.drained = True


class _BlockStream:
    """StreamContext stand-in that records how many blocks were consumed."""

    def __init__(self, blocks: list[list[list[Any]]]) -> None:
        self.response = _Response()
        self.source = MagicMock()
        self.source.column_names = ["id"]
        self.source.column_types = []
        self.source.summary = None
        self.source.source.response = self.response
        self._blocks = blocks
        self.consumed = 0

    def __enter__(self) -> "_BlockStream":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.response.drain_conn()
        self.response.close()

    def __iter__(self) -> Iterator[list[list[Any]]]:
        for block in self._blocks:
            self.consumed += 1
            yield block


def test_http_execute_pushes_limit_and_stops_early() -> None:
    blocks = [[[n] for n in range(3)] for _ in range(4)]
    stream = _BlockStream(blocks)
    seen: list[str] = []

    client = MagicMock()

    def query_row_block_stream(sql: str) -> _BlockStream:
        seen.append(sql)
        return stream

    client.query_row_block_stream = query_row_block_stream

    driver = ClickHouseHttpDriver()
    with patch(
        "sql_studio.drivers.clickhouse_http.clickhouse_connect.get_client",
        return_value=client,
    ):
        driver.connect(_config(8123))
    result = driver.execute("SELECT * FROM db.t", limit=4)

    assert seen == ["SELECT * FROM db.t LIMIT 5"]
    # 4 rows fit the grid; reading stops on the block that proves there are more.
    assert stream.consumed == 2
    # ...and the rest of the response is dropped, not read to the end.
    assert stream.response.drained is False
    assert stream.response.closed is True
    assert result.row_count == 4
    assert result.truncated is True


def test_native_execute_stops_early_and_drops_the_connection() -> None:
    client = MagicMock()
    seen: list[str] = []

    def execute_iter(sql: str, with_column_types: bool = False) -> Iterator[Any]:
        seen.append(sql)
        yield [("id", "UInt8")]
        for n in range(100):
            yield (n,)

    client.execute_iter = execute_iter

    driver = ClickHouseNativeDriver()
    with patch(
        "sql_studio.drivers.clickhouse_native.NativeClient",
        return_value=client,
    ):
        driver.connect(_config(9000))
    client.disconnect.reset_mock()
    result = driver.execute("SELECT * FROM db.t", limit=4)

    assert seen == ["SELECT * FROM db.t LIMIT 5"]
    assert result.row_count == 4
    assert result.truncated is True
    assert result.columns[0].name == "id"
    # The stream was abandoned mid-result, so the socket must not be reused.
    assert client.disconnect.called


def test_native_execute_keeps_the_connection_when_the_result_fits() -> None:
    client = MagicMock()

    def execute_iter(sql: str, with_column_types: bool = False) -> Iterator[Any]:
        yield [("id", "UInt8")]
        yield (1,)

    client.execute_iter = execute_iter

    driver = ClickHouseNativeDriver()
    with patch(
        "sql_studio.drivers.clickhouse_native.NativeClient",
        return_value=client,
    ):
        driver.connect(_config(9000))
    client.disconnect.reset_mock()
    result = driver.execute("SELECT * FROM db.t", limit=4)

    assert result.row_count == 1
    assert result.truncated is False
    assert not client.disconnect.called


def test_native_execute_drops_the_client_after_a_connection_error() -> None:
    client = MagicMock()

    def execute_iter(sql: str, with_column_types: bool = False) -> Iterator[Any]:
        raise EOFError("Unexpected EOF while reading bytes")
        yield  # pragma: no cover - generator marker

    client.execute_iter = execute_iter

    driver = ClickHouseNativeDriver()
    config = _config(9000)
    with patch(
        "sql_studio.drivers.clickhouse_native.NativeClient",
        return_value=client,
    ):
        driver.connect(config)
        with pytest.raises(EOFError):
            driver.execute("SELECT * FROM db.t", limit=4)

    # A client that died mid-query rejects every later one, so the pool must not
    # keep handing it out.
    assert driver.is_connected_with(config) is False


def test_native_execute_keeps_the_client_after_a_server_error() -> None:
    client = MagicMock()
    failure = native_errors.ServerException("Unknown table db.t", code=60)

    def execute_iter(sql: str, with_column_types: bool = False) -> Iterator[Any]:
        raise failure
        yield  # pragma: no cover - generator marker

    client.execute_iter = execute_iter

    driver = ClickHouseNativeDriver()
    config = _config(9000)
    with patch(
        "sql_studio.drivers.clickhouse_native.NativeClient",
        return_value=client,
    ):
        driver.connect(config)
        with pytest.raises(native_errors.ServerException):
            driver.execute("SELECT * FROM db.t", limit=4)

    assert driver.is_connected_with(config) is True
