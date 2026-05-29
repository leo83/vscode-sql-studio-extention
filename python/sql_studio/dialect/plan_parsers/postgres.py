"""PostgreSQL EXPLAIN (FORMAT JSON) parser."""

from __future__ import annotations

from typing import Any

from sql_studio.dialect.plan_parsers.base import _extract_json_cell, _metric, _node_id
from sql_studio.models import ParsedPlan, PlanMetric, PlanNode, QueryResult


def _collect_metrics(plan: dict[str, Any]) -> list[PlanMetric]:
    metrics: list[PlanMetric] = []
    mapping = [
        ("Startup Cost", plan.get("Startup Cost")),
        ("Total Cost", plan.get("Total Cost")),
        ("Plan Rows", plan.get("Plan Rows")),
        ("Plan Width", plan.get("Plan Width")),
        ("Actual Startup Time", plan.get("Actual Startup Time")),
        ("Actual Total Time", plan.get("Actual Total Time")),
        ("Actual Rows", plan.get("Actual Rows")),
        ("Actual Loops", plan.get("Actual Loops")),
        ("Shared Hit Blocks", plan.get("Shared Hit Blocks")),
        ("Shared Read Blocks", plan.get("Shared Read Blocks")),
    ]
    for label, value in mapping:
        metric = _metric(label, value)
        if metric is not None:
            metrics.append(metric)
    return metrics


def _collect_tags(plan: dict[str, Any]) -> list[str]:
    tags: list[str] = []
    node_type = str(plan.get("Node Type", ""))
    if node_type in {"Seq Scan", "Foreign Scan"}:
        tags.append("full_scan")
    plan_rows = plan.get("Plan Rows")
    actual_rows = plan.get("Actual Rows")
    if isinstance(plan_rows, (int, float)) and isinstance(actual_rows, (int, float)):
        if plan_rows > 0 and actual_rows > plan_rows * 10:
            tags.append("expensive")
        if actual_rows > 100_000:
            tags.append("expensive")
    total_cost = plan.get("Total Cost")
    if isinstance(total_cost, (int, float)) and total_cost > 10_000:
        tags.append("expensive")
    return tags


def _parse_node(plan: dict[str, Any], index: int, prefix: str = "pg") -> PlanNode:
    node_type = str(plan.get("Node Type", "Plan"))
    relation = plan.get("Relation Name")
    alias = plan.get("Alias")
    index_name = plan.get("Index Name")
    filter_expr = plan.get("Filter") or plan.get("Index Cond") or plan.get("Recheck Cond")

    subtitle_parts: list[str] = []
    if relation:
        schema = plan.get("Schema")
        qualified = f"{schema}.{relation}" if schema else str(relation)
        if alias and alias != relation:
            qualified = f"{qualified} AS {alias}"
        subtitle_parts.append(qualified)
    if index_name:
        subtitle_parts.append(f"index: {index_name}")
    if filter_expr:
        subtitle_parts.append(str(filter_expr))

    children = [
        _parse_node(child, child_index, prefix=f"{prefix}-{index}")
        for child_index, child in enumerate(plan.get("Plans") or [])
        if isinstance(child, dict)
    ]

    return PlanNode(
        id=_node_id(prefix, index),
        kind=node_type,
        title=node_type,
        subtitle=" · ".join(subtitle_parts) if subtitle_parts else None,
        metrics=_collect_metrics(plan),
        tags=_collect_tags(plan),
        children=children,
    )


def parse(result: QueryResult) -> ParsedPlan:
    payload = _extract_json_cell(result)
    if isinstance(payload, list) and payload:
        root = payload[0].get("Plan") if isinstance(payload[0], dict) else None
    elif isinstance(payload, dict):
        root = payload.get("Plan", payload)
    else:
        return ParsedPlan(plan_format="text")

    if not isinstance(root, dict):
        return ParsedPlan(plan_format="text")

    tree = [_parse_node(root, 0)]
    return ParsedPlan(plan_tree=tree, plan_format="tree")
