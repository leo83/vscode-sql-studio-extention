"""SQLite EXPLAIN QUERY PLAN parser."""

from __future__ import annotations

from sql_studio.dialect.plan_parsers.base import _node_id
from sql_studio.models import ParsedPlan, PlanNode, QueryResult


def parse(result: QueryResult) -> ParsedPlan:
    if not result.rows:
        return ParsedPlan(plan_format="text")

    columns = [column.name.lower() for column in result.columns]
    if "detail" not in columns:
        return ParsedPlan(plan_format="table")

    id_idx = columns.index("id") if "id" in columns else None
    parent_idx = columns.index("parent") if "parent" in columns else None
    detail_idx = columns.index("detail")

    nodes_by_id: dict[int, PlanNode] = {}
    roots: list[PlanNode] = []

    for row_index, row in enumerate(result.rows):
        node_id_value = int(row[id_idx]) if id_idx is not None and row[id_idx] is not None else row_index + 1
        parent_value = int(row[parent_idx]) if parent_idx is not None and row[parent_idx] is not None else 0
        detail = str(row[detail_idx])
        kind = detail.split()[0] if detail else "STEP"
        node = PlanNode(
            id=_node_id("sq", row_index),
            kind=kind,
            title=detail,
            tags=["full_scan"] if "SCAN" in detail.upper() else [],
            children=[],
        )
        nodes_by_id[node_id_value] = node
        if parent_value == 0:
            roots.append(node)

    for row_index, row in enumerate(result.rows):
        node_id_value = int(row[id_idx]) if id_idx is not None and row[id_idx] is not None else row_index + 1
        parent_value = int(row[parent_idx]) if parent_idx is not None and row[parent_idx] is not None else 0
        if parent_value != 0 and parent_value in nodes_by_id and node_id_value in nodes_by_id:
            parent = nodes_by_id[parent_value]
            child = nodes_by_id[node_id_value]
            if child not in parent.children:
                parent.children.append(child)

    if not roots and nodes_by_id:
        roots = [next(iter(nodes_by_id.values()))]

    return ParsedPlan(plan_tree=roots, plan_format="tree")
