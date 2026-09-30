"""TLS certificate verification is passed through to both ClickHouse drivers."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from sql_studio.drivers.clickhouse_http import ClickHouseHttpDriver
from sql_studio.drivers.clickhouse_native import ClickHouseNativeDriver
from sql_studio.models import ConnectionConfig


def _config(port: int, **overrides: object) -> ConnectionConfig:
    return ConnectionConfig(
        id="ch-1",
        dialect="clickhouse",
        host="localhost",
        port=port,
        database="default",
        username="default",
        password="",
        ssl=True,
        **overrides,
    )


@pytest.mark.parametrize(("skip", "verify"), [(False, True), (True, False)])
def test_native_driver_verify_flag(skip: bool, verify: bool) -> None:
    with patch(
        "sql_studio.drivers.clickhouse_native.NativeClient",
        return_value=MagicMock(),
    ) as client_cls:
        ClickHouseNativeDriver().connect(_config(9440, ssl_skip_verify=skip))
    kwargs = client_cls.call_args.kwargs
    assert kwargs["secure"] is True
    assert kwargs["verify"] is verify


@pytest.mark.parametrize(("skip", "verify"), [(False, True), (True, False)])
def test_http_driver_verify_flag(skip: bool, verify: bool) -> None:
    with patch(
        "sql_studio.drivers.clickhouse_http.clickhouse_connect.get_client",
        return_value=MagicMock(),
    ) as get_client:
        ClickHouseHttpDriver().connect(_config(8443, ssl_skip_verify=skip))
    kwargs = get_client.call_args.kwargs
    assert kwargs["secure"] is True
    assert kwargs["verify"] is verify
