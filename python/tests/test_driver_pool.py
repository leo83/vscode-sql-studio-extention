"""Tests for driver pool connection reuse."""

from unittest.mock import MagicMock, patch

from sql_studio.drivers.postgres import PostgresDriver
from sql_studio.drivers.registry import _DRIVERS, get_driver
from sql_studio.models import ConnectionConfig


def _config(connection_id: str = "conn-1") -> ConnectionConfig:
    return ConnectionConfig(
        id=connection_id,
        dialect="postgres",
        host="localhost",
        port=5432,
        database="app",
        username="user",
        password="secret",
    )


def setup_function() -> None:
    for driver in list(_DRIVERS.values()):
        driver.disconnect()
    _DRIVERS.clear()


def test_get_driver_reuses_active_connection() -> None:
    config = _config()
    mock_conn = MagicMock()
    mock_conn.closed = False

    with patch(
        "sql_studio.drivers.postgres.psycopg.connect",
        return_value=mock_conn,
    ) as connect:
        first = get_driver(config)
        second = get_driver(config)

    assert first is second
    assert isinstance(first, PostgresDriver)
    connect.assert_called_once()


def test_get_driver_reconnects_when_config_changes() -> None:
    config = _config()
    mock_conn = MagicMock()
    mock_conn.closed = False

    with patch(
        "sql_studio.drivers.postgres.psycopg.connect",
        return_value=mock_conn,
    ) as connect:
        get_driver(config)
        changed = config.model_copy(update={"database": "other"})
        get_driver(changed)

    assert connect.call_count == 2
    assert mock_conn.close.call_count == 1
