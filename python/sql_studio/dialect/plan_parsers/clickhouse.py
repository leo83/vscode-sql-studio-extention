"""ClickHouse EXPLAIN json=1 parser."""

from __future__ import annotations

from typing import Any

from sql_studio.dialect.plan_parsers.base import (
    _extract_json_cell,
    _extract_kind,
    _metric,
    _node_id,
    _parse_subtitle,
    format_plan_text,
    parse_indented_text_plan,
)
from sql_studio.models import ParsedPlan, PlanMetric, PlanNode, QueryResult


def _node_from_mapping(data: dict[str, Any], index: int, prefix: str = "ch") -> PlanNode:
    plan_value = data.get("Plan") or data.get("plan") or data.get("Description") or data.get("description")
    if isinstance(plan_value, dict):
        return _node_from_mapping(plan_value, index, prefix=prefix)

    title = str(plan_value or data.get("Node Type") or data.get("node type") or "Plan")
    kind = str(data.get("Node Type") or data.get("node type") or _extract_kind(title))
    subtitle = data.get("Description") or data.get("description")
    if subtitle is not None and str(subtitle) == title:
        subtitle = None

    metrics: list[PlanMetric] = []
    for label, key in (
        ("Est. rows", data.get("Est. rows") or data.get("Est Rows")),
        ("Est. cost", data.get("Est. cost") or data.get("Est Cost")),
    ):
        metric = _metric(label, key)
        if metric is not None:
            metrics.append(metric)

    children: list[PlanNode] = []
    nested = data.get("Plans") or data.get("plans") or data.get("Children") or data.get("children")
    if isinstance(nested, list):
        children = [
            _node_from_mapping(child, child_index, prefix=f"{prefix}-{index}")
            for child_index, child in enumerate(nested)
            if isinstance(child, dict)
        ]

    parsed_title, parsed_subtitle = _parse_subtitle(title)
    return PlanNode(
        id=_node_id(prefix, index),
        kind=kind,
        title=parsed_title,
        subtitle=str(subtitle) if subtitle is not None else parsed_subtitle,
        metrics=metrics,
        tags=["full_scan"] if "ReadFrom" in kind else [],
        children=children,
    )


def _parse_json_payload(payload: Any) -> list[PlanNode]:
    if isinstance(payload, dict):
        if "Plan" in payload or "plan" in payload or "Plans" in payload or "plans" in payload:
            return [_node_from_mapping(payload, 0)]
        return [_node_from_mapping(payload, index) for index, payload in enumerate([payload])]
    if isinstance(payload, list):
        nodes: list[PlanNode] = []
        for index, item in enumerate(payload):
            if isinstance(item, dict):
                if "Plan" in item or "plan" in item:
                    nodes.append(_node_from_mapping(item, index))
                else:
                    nodes.append(_node_from_mapping(item, index))
            elif isinstance(item, str):
                kind = _extract_kind(item)
                title, subtitle = _parse_subtitle(item)
                nodes.append(
                    PlanNode(
                        id=_node_id("ch", index),
                        kind=kind,
                        title=title,
                        subtitle=subtitle,
                    )
                )
        return nodes
    return []


def parse(result: QueryResult) -> ParsedPlan:
    payload = _extract_json_cell(result)
    tree = _parse_json_payload(payload) if payload is not None else []

    if tree:
        return ParsedPlan(plan_tree=tree, plan_format="tree")

    raw_text = format_plan_text(result)
    if raw_text:
        text_tree = parse_indented_text_plan(raw_text, prefix="ch-text")
        if text_tree:
            return ParsedPlan(plan_tree=text_tree, plan_format="tree")
    return ParsedPlan(plan_format="text")
