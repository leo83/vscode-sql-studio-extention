"""JSON-RPC server over stdio for SQL Studio."""

from __future__ import annotations

import json
import sys
import threading
import traceback
from typing import Any, Callable

from pydantic import ValidationError

from sql_studio.dialect import sqlglot_service
from sql_studio.dialect.explain import (
    attach_plan_text,
    build_explain_sql,
    is_explainable,
)
from sql_studio.dialect.query_analysis import (
    LARGE_TABLE_ROW_THRESHOLD,
    get_unbounded_select_tables,
)
from sql_studio.drivers.registry import (
    cancel_query,
    disconnect,
    get_driver,
    get_session_database,
    is_connection_active,
    set_session_database,
    test_connection,
)
from sql_studio.drivers.clickhouse_session import parse_use_database
from sql_studio.drivers.table_stats import (
    estimate_table_row_count,
    format_qualified_table,
    resolve_table_schema,
)
from sql_studio.export.csv_export import export_csv
from sql_studio.export.excel_export import export_xlsx
from sql_studio.query_cancel import QueryCancelledError, is_query_cancelled_error
from sql_studio.models import (
    ConnectionConfig,
    CheckUnboundedSelectResult,
    ExportResult,
    QueryExecuteResult,
    QueryResult,
    ObjectDescription,
    SchemaDbmlResult,
    SchemaNode,
    StatementResult,
    LargeTableWarning,
)


Handler = Callable[[dict[str, Any]], Any]


class JsonRpcServer:
    def __init__(self) -> None:
        self._stdout_lock = threading.Lock()
        self._handlers: dict[str, Handler] = {
            "health": self._health,
            "connection/test": self._connection_test,
            "connection/connect": self._connection_connect,
            "connection/isConnected": self._connection_is_connected,
            "connection/disconnect": self._connection_disconnect,
            "query/execute": self._query_execute,
            "query/explain": self._query_explain,
            "query/cancel": self._query_cancel,
            "schema/listChildren": self._schema_list_children,
            "schema/getTableDDL": self._schema_get_table_ddl,
            "schema/getObjectDescription": self._schema_get_object_description,
            "schema/getDbml": self._schema_get_dbml,
            "sql/format": self._sql_format,
            "sql/split": self._sql_split,
            "sql/checkUnboundedSelect": self._sql_check_unbounded_select,
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
            except json.JSONDecodeError as exc:
                self._write(self._error(None, -32700, f"Parse error: {exc}"))
                continue

            if request.get("method") in ("query/execute", "query/explain"):
                threading.Thread(
                    target=self._respond,
                    args=(request,),
                    daemon=True,
                ).start()
                continue

            self._respond(request)

    def _respond(self, request: dict[str, Any]) -> None:
        try:
            response = self._handle(request)
        except json.JSONDecodeError as exc:
            response = self._error(None, -32700, f"Parse error: {exc}")
        self._write(response)

    def _write(self, response: dict[str, Any]) -> None:
        with self._stdout_lock:
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
        except QueryCancelledError:
            return self._error(req_id, -32001, "Query cancelled")
        except Exception as exc:
            if is_query_cancelled_error(exc):
                return self._error(req_id, -32001, "Query cancelled")
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
        test_connection(config)
        return {"ok": True}

    def _connection_connect(self, params: dict[str, Any]) -> dict[str, bool]:
        config = ConnectionConfig.model_validate(params["connection"])
        get_driver(config)
        return {"ok": True}

    def _connection_is_connected(self, params: dict[str, Any]) -> dict[str, bool]:
        return {"connected": is_connection_active(params["connectionId"])}

    def _connection_disconnect(self, params: dict[str, Any]) -> dict[str, bool]:
        disconnect(params["connectionId"])
        return {"ok": True}

    def _query_cancel(self, params: dict[str, Any]) -> dict[str, bool]:
        connection_id = params["connectionId"]
        return {"ok": cancel_query(connection_id)}

    def _query_execute(self, params: dict[str, Any]) -> dict[str, Any]:
        config = ConnectionConfig.model_validate(params["connection"])
        sql = params["sql"]
        limit = params.get("limit", 10_000)
        dialect = config.dialect
        statements = sqlglot_service.split_statements(sql, dialect)
        if not statements:
            raise ValueError(
                "No executable SQL found. Add a statement (e.g. SELECT) or select SQL text to run."
            )
        driver = get_driver(config)
        batch: list[StatementResult] = []
        total_duration_ms = 0.0
        for index, statement in enumerate(statements, start=1):
            active_database = get_session_database(config.id)
            if active_database:
                setter = getattr(driver, "set_active_database", None)
                if callable(setter):
                    setter(active_database)
            result = driver.execute(statement, limit=limit)
            total_duration_ms += result.duration_ms
            database = parse_use_database(statement)
            if database and not result.error:
                set_session_database(config.id, database)
            batch.append(
                StatementResult(
                    index=index,
                    sql=statement,
                    **result.model_dump(),
                )
            )
            if result.error:
                break
        return QueryExecuteResult(
            statements=batch,
            total_duration_ms=total_duration_ms,
        ).model_dump()

    def _query_explain(self, params: dict[str, Any]) -> dict[str, Any]:
        config = ConnectionConfig.model_validate(params["connection"])
        sql = params["sql"]
        limit = params.get("limit", 10_000)
        analyze = bool(params.get("analyze", False))
        dialect = config.dialect
        statements = sqlglot_service.split_statements(sql, dialect)
        if not statements:
            raise ValueError(
                "No executable SQL found. Move the cursor into a SELECT/WITH statement or select SQL text."
            )

        target_index: int | None = None
        for index in range(len(statements) - 1, -1, -1):
            statement = statements[index]
            if sqlglot_service.is_session_statement(statement):
                continue
            if is_explainable(statement, dialect):
                target_index = index
                break
        if target_index is None:
            raise ValueError(
                "Execution plan is only available for SELECT, WITH, or EXPLAIN queries."
            )

        driver = get_driver(config)
        total_duration_ms = 0.0
        target_sql = statements[target_index]

        for index, statement in enumerate(statements):
            if index >= target_index:
                break
            active_database = get_session_database(config.id)
            if active_database:
                setter = getattr(driver, "set_active_database", None)
                if callable(setter):
                    setter(active_database)
            result = driver.execute(statement, limit=limit)
            total_duration_ms += result.duration_ms
            database = parse_use_database(statement)
            if database and not result.error:
                set_session_database(config.id, database)
            if result.error:
                return QueryExecuteResult(
                    statements=[
                        StatementResult(
                            index=1,
                            sql=target_sql,
                            **result.model_dump(),
                        )
                    ],
                    total_duration_ms=total_duration_ms,
                ).model_dump()

        active_database = get_session_database(config.id)
        if active_database:
            setter = getattr(driver, "set_active_database", None)
            if callable(setter):
                setter(active_database)

        explain_sql = build_explain_sql(target_sql, dialect, analyze=analyze)
        result = driver.execute(explain_sql, limit=limit)
        total_duration_ms += result.duration_ms
        stmt = attach_plan_text(
            StatementResult(
                index=1,
                sql=target_sql,
                **result.model_dump(),
            )
        )
        return QueryExecuteResult(
            statements=[stmt],
            total_duration_ms=total_duration_ms,
        ).model_dump()

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

    def _schema_get_object_description(self, params: dict[str, Any]) -> dict[str, Any]:
        config = ConnectionConfig.model_validate(params["connection"])
        path = params.get("path") or []
        driver = get_driver(config)
        description: ObjectDescription = driver.get_object_description(path)
        return description.model_dump()

    def _schema_get_dbml(self, params: dict[str, Any]) -> dict[str, Any]:
        config = ConnectionConfig.model_validate(params["connection"])
        path = params.get("path") or []
        driver = get_driver(config)
        result: SchemaDbmlResult = driver.get_schema_dbml(path)
        return result.model_dump()

    def _sql_format(self, params: dict[str, Any]) -> dict[str, str]:
        sql = params["sql"]
        dialect = params.get("dialect", "postgres")
        return {"sql": sqlglot_service.format_sql(sql, dialect)}

    def _sql_split(self, params: dict[str, Any]) -> dict[str, list[str]]:
        sql = params["sql"]
        dialect = params.get("dialect", "postgres")
        return {"statements": sqlglot_service.split_statements(sql, dialect)}

    def _sql_check_unbounded_select(self, params: dict[str, Any]) -> dict[str, Any]:
        config = ConnectionConfig.model_validate(params["connection"])
        sql = params["sql"]
        threshold = int(params.get("threshold", LARGE_TABLE_ROW_THRESHOLD))
        dialect = config.dialect
        statements = sqlglot_service.split_statements(sql, dialect)
        driver = get_driver(config)
        active_database = get_session_database(config.id)
        if active_database:
            setter = getattr(driver, "set_active_database", None)
            if callable(setter):
                setter(active_database)

        warnings: list[LargeTableWarning] = []
        seen_tables: set[str] = set()
        for statement in statements:
            if sqlglot_service.is_session_statement(statement):
                database = parse_use_database(statement)
                if database:
                    active_database = database
                    setter = getattr(driver, "set_active_database", None)
                    if callable(setter):
                        setter(database)
                continue

            tables = get_unbounded_select_tables(statement, dialect)
            for table_ref in tables:
                schema = resolve_table_schema(
                    dialect,
                    table_ref.schema,
                    config=config,
                    active_database=active_database,
                )
                qualified = format_qualified_table(dialect, schema, table_ref.name)
                if qualified in seen_tables:
                    continue
                seen_tables.add(qualified)

                estimate = estimate_table_row_count(driver, dialect, schema, table_ref.name)
                if estimate is None or estimate <= threshold:
                    continue

                warnings.append(
                    LargeTableWarning(
                        table=qualified,
                        row_estimate=estimate,
                        message=(
                            f"{qualified} (~{estimate:,} rows) may scan a large table. "
                            "Consider adding LIMIT."
                        ),
                    )
                )

        return CheckUnboundedSelectResult(warnings=warnings).model_dump()

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
