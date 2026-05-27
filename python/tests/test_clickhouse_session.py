"""Tests for ClickHouse USE session handling."""

from types import SimpleNamespace
from unittest.mock import MagicMock

from sql_studio.drivers.clickhouse_session import (
    apply_use_database,
    parse_use_database,
    set_client_database,
)


class _HttpClient(SimpleNamespace):
    __module__ = "clickhouse_connect.driver.httpclient"


class _NativeClient(SimpleNamespace):
    __module__ = "clickhouse_driver.client"


def test_parse_use_database() -> None:
    assert parse_use_database("use robotisation") == "robotisation"
    assert parse_use_database("USE `robotisation`;") == "robotisation"
    assert parse_use_database("SELECT 1") is None


def test_apply_use_database_updates_http_client() -> None:
    client = _HttpClient(database="default")
    apply_use_database(client, "USE robotisation")
    assert client.database == "robotisation"


def test_set_client_database_updates_native_connection() -> None:
    client = _NativeClient(connection=SimpleNamespace(database="default"))
    set_client_database(client, "robotisation")
    assert client.connection.database == "robotisation"
