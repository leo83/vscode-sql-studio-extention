"""JSON-RPC server over stdio for SQL Studio."""

from __future__ import annotations

import json
import sys
import traceback
from typing import Any, Callable

from pydantic import ValidationError

from sql_studio.dialect import sqlglot_service
from sql_studio.drivers.registry import disconnect, get_driver
from sql_studio.export.csv_export import export_csv
from sql_studio.export.excel_export import export_xlsx
from sql_studio.models import ConnectionConfig, ExportResult, QueryResult, SchemaNode


Handler = Callable[[dict[str, Any]], Any]


class JsonRpcServer:
    def __init__(self) -> None:
        self._handlers: dict[str, Handler] = {
            "health": self._health,
            "connection/test": self._connection_test,
            "connection/disconnect": self._connection_disconnect,
            "query/execute": self._query_execute,
            "schema/listChildren": self._schema_list_children,
            "schema/getTableDDL": self._schema_get_table_ddl,
            "sql/format": self._sql_format,
            "sql/split": self._sql_split,
            "export/csv": self._export_csv,
            "export/xlsx": self._export_xlsx,
        }

    def run(self) -> None:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                request = json.loads(line)
                response = self._handle(request)
            except json.JSONDecodeError as exc:
                response = self._error(None, -32700, f"Parse error: {exc}")
            sys.stdout.write(json.dumps(response, default=str) + "\n")
            sys.stdout.flush()

    def _handle(self, request: dict[str, Any]) -> dict[str, Any]:
        req_id = request.get("id")
        method = request.get("method")
        params = request.get("params") or {}
        if method not in self._handlers:
            return self._error(req_id, -32601, f"Method not found: {method}")
        try:
            result = self._handlers[method](params)
            return {"jsonrpc": "2.0", "id": req_id, "result": result}
        except ValidationError as exc:
            return self._error(req_id, -32602, str(exc))
        except Exception as exc:
            traceback.print_exc(file=sys.stderr)
            return self._error(req_id, -32000, str(exc))

    @staticmethod
    def _error(req_id: Any, code: int, message: str) -> dict[str, Any]:
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {"code": code, "message": message},
        }

    @staticmethod
    def _health(_params: dict[str, Any]) -> dict[str, str]:
        return {"status": "ok", "version": "0.1.0"}

    def _connection_test(self, params: dict[str, Any]) -> dict[str, bool]:
        config = ConnectionConfig.model_validate(params["connection"])
        driver = get_driver(config)
        driver.test_connection()
        return {"ok": True}

    def _connection_disconnect(self, params: dict[str, Any]) -> dict[str, bool]:
        disconnect(params["connectionId"])
        return {"ok": True}

    def _query_execute(self, params: dict[str, Any]) -> dict[str, Any]:
        config = ConnectionConfig.model_validate(params["connection"])
        sql = params["sql"]
        limit = params.get("limit", 10_000)
        dialect = config.dialect
        statements = sqlglot_service.split_statements(sql, dialect)
        if not statements:
            raise ValueError("No SQL statements to execute")
        driver = get_driver(config)
        last_result: QueryResult | None = None
        for statement in statements:
            last_result = driver.execute(statement, limit=limit)
            if last_result.error:
                break
        assert last_result is not None
        return last_result.model_dump()

    def _schema_list_children(self, params: dict[str, Any]) -> list[dict[str, Any]]:
        config = ConnectionConfig.model_validate(params["connection"])
        path = params.get("path") or []
        driver = get_driver(config)
        nodes: list[SchemaNode] = driver.list_schema_children(path)
        return [n.model_dump() for n in nodes]

    def _schema_get_table_ddl(self, params: dict[str, Any]) -> dict[str, str]:
        config = ConnectionConfig.model_validate(params["connection"])
        path = params.get("path") or []
        driver = get_driver(config)
        return {"ddl": driver.get_table_ddl(path)}

    def _sql_format(self, params: dict[str, Any]) -> dict[str, str]:
        sql = params["sql"]
        dialect = params.get("dialect", "postgres")
        return {"sql": sqlglot_service.format_sql(sql, dialect)}

    def _sql_split(self, params: dict[str, Any]) -> dict[str, list[str]]:
        sql = params["sql"]
        dialect = params.get("dialect", "postgres")
        return {"statements": sqlglot_service.split_statements(sql, dialect)}

    def _export_csv(self, params: dict[str, Any]) -> dict[str, Any]:
        path = params["path"]
        columns = params["columns"]
        rows = params["rows"]
        count = export_csv(path, columns, rows, bom=params.get("bom", True))
        return ExportResult(path=path, row_count=count).model_dump()

    def _export_xlsx(self, params: dict[str, Any]) -> dict[str, Any]:
        path = params["path"]
        columns = params["columns"]
        rows = params["rows"]
        count = export_xlsx(path, columns, rows)
        return ExportResult(path=path, row_count=count).model_dump()


def main() -> None:
    JsonRpcServer().run()


if __name__ == "__main__":
    main()
