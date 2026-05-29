"""MySQL EXPLAIN FORMAT=JSON and classic tabular EXPLAIN parser."""

from __future__ import annotations

from typing import Any

from sql_studio.dialect.plan_parsers.base import _extract_json_cell, _metric, _node_id
from sql_studio.models import ParsedPlan, PlanMetric, PlanNode, QueryResult


def _parse_json_node(data: dict[str, Any], index: int, prefix: str = "my") -> PlanNode:
    if "query_block" in data:
        return _parse_json_node(data["query_block"], index, prefix=prefix)

    select_id = data.get("select_id")
    cost_info = data.get("cost_info") if isinstance(data.get("cost_info"), dict) else {}
    metrics: list[PlanMetric] = []
    for label, key in (
        ("Query cost", cost_info.get("query_cost")),
        ("Read cost", cost_info.get("read_cost")),
        ("Eval cost", cost_info.get("eval_cost")),
        ("Rows examined", data.get("rows_examined_per_scan")),
        ("Rows produced", data.get("rows_produced_per_join")),
    ):
        metric = _metric(label, key)
        if metric is not None:
            metrics.append(metric)
    if select_id is not None:
        metric = _metric("Select ID", select_id)
        if metric is not None:
            metrics.append(metric)

    children: list[PlanNode] = []
    nested_tables = data.get("nested_loop") or data.get("ordering_operation") or data.get("grouping_operation")
    if isinstance(nested_tables, list):
        for child_index, child in enumerate(nested_tables):
            if isinstance(child, dict) and "table" in child:
                table = child["table"]
                if isinstance(table, dict):
                    children.append(_parse_table_node(table, child_index, prefix=f"{prefix}-{index}"))
            elif isinstance(child, dict):
                children.append(_parse_json_node(child, child_index, prefix=f"{prefix}-{index}"))

    table = data.get("table")
    if isinstance(table, dict):
        return _parse_table_node(table, index, prefix=prefix, extra_metrics=metrics, extra_children=children)

    message = data.get("message") or data.get("select_type") or "Query block"
    return PlanNode(
        id=_node_id(prefix, index),
        kind=str(message),
        title=str(message),
        metrics=metrics,
        children=children,
    )


def _parse_table_node(
    table: dict[str, Any],
    index: int,
    *,
    prefix: str = "my",
    extra_metrics: list[PlanMetric] | None = None,
    extra_children: list[PlanNode] | None = None,
) -> PlanNode:
    access_type = str(table.get("access_type") or "table")
    table_name = table.get("table_name") or table.get("table")
    metrics = list(extra_metrics or [])
    for label, key in (
        ("Rows", table.get("rows")),
        ("Filtered", table.get("filtered")),
        ("Cost", table.get("cost_info", {}).get("read_cost") if isinstance(table.get("cost_info"), dict) else None),
        ("Key", table.get("key")),
    ):
        metric = _metric(label, key)
        if metric is not None:
            metrics.append(metric)

    tags: list[str] = []
    if access_type.upper() in {"ALL", "INDEX"}:
        tags.append("full_scan")

    return PlanNode(
        id=_node_id(prefix, index),
        kind=access_type,
        title=access_type,
        subtitle=str(table_name) if table_name else table.get("attached_condition"),
        metrics=metrics,
        tags=tags,
        children=list(extra_children or []),
    )


def _parse_classic_table(result: QueryResult) -> ParsedPlan:
    columns = [column.name.lower() for column in result.columns]
    if "id" not in columns or not result.rows:
        return ParsedPlan(plan_format="table")

    id_idx = columns.index("id")
    table_idx = columns.index("table") if "table" in columns else None
    type_idx = columns.index("type") if "type" in columns else None
    key_idx = columns.index("key") if "key" in columns else None
    rows_idx = columns.index("rows") if "rows" in columns else None
    extra_idx = columns.index("extra") if "extra" in columns else None

    nodes_by_id: dict[str, PlanNode] = {}
    roots: list[PlanNode] = []

    for row_index, row in enumerate(result.rows):
        node_id = str(row[id_idx]) if row[id_idx] is not None else str(row_index + 1)
        access_type = str(row[type_idx]) if type_idx is not None and row[type_idx] is not None else "step"
        table_name = str(row[table_idx]) if table_idx is not None and row[table_idx] is not None else None
        metrics: list[PlanMetric] = []
        if rows_idx is not None:
            metric = _metric("Rows", row[rows_idx])
            if metric is not None:
                metrics.append(metric)
        if key_idx is not None:
            metric = _metric("Key", row[key_idx])
            if metric is not None:
                metrics.append(metric)
        extra = str(row[extra_idx]) if extra_idx is not None and row[extra_idx] is not None else None

        node = PlanNode(
            id=_node_id("my-table", row_index),
            kind=access_type,
            title=access_type,
            subtitle=table_name or extra,
            metrics=metrics,
            tags=["full_scan"] if access_type.upper() == "ALL" else [],
            children=[],
        )
        nodes_by_id[node_id] = node
        if node_id == "1" or row_index == 0:
            roots.append(node)

    if len(roots) == 1 and len(result.rows) > 1:
        root = roots[0]
        for row_index, row in enumerate(result.rows[1:], start=1):
            child = nodes_by_id.get(str(row[id_idx]))
            if child is not None and child is not root:
                root.children.append(child)

    if roots:
        return ParsedPlan(plan_tree=roots, plan_format="tree")

    flat_nodes = [
        PlanNode(
            id=_node_id("my-flat", row_index),
            kind=str(row[type_idx]) if type_idx is not None and row[type_idx] is not None else "row",
            title=" | ".join(str(value) if value is not None else "" for value in row),
            subtitle=str(row[table_idx]) if table_idx is not None and row[table_idx] is not None else None,
        )
        for row_index, row in enumerate(result.rows)
    ]
    return ParsedPlan(plan_tree=flat_nodes, plan_format="table")


def parse(result: QueryResult) -> ParsedPlan:
    payload = _extract_json_cell(result)
    if isinstance(payload, dict):
        tree = [_parse_json_node(payload, 0)]
        return ParsedPlan(plan_tree=tree, plan_format="tree")

    if len(result.columns) > 1:
        parsed = _parse_classic_table(result)
        if parsed.plan_tree:
            return parsed
        return ParsedPlan(plan_format="table")

    return ParsedPlan(plan_format="text")
