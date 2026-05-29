"""Microsoft SQL Server SHOWPLAN_XML parser."""

from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import Any

from sql_studio.dialect.plan_parsers.base import _metric, _node_id, format_plan_text
from sql_studio.models import ParsedPlan, PlanMetric, PlanNode, QueryResult


def _local_name(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[-1]
    return tag


def _attr(element: ET.Element, name: str) -> str | None:
    value = element.get(name)
    if value is None:
        for key, candidate in element.attrib.items():
            if _local_name(key) == name:
                return candidate
    return value


def _parse_relop(element: ET.Element, index: int, prefix: str = "ms") -> PlanNode:
    physical = _attr(element, "PhysicalOp") or "Operation"
    logical = _attr(element, "LogicalOp")
    estimate_rows = _attr(element, "EstimateRows")
    estimate_io = _attr(element, "EstimateIO")
    estimate_cpu = _attr(element, "EstimateCPU")
    subtree_cost = _attr(element, "EstimatedTotalSubtreeCost")

    metrics: list[PlanMetric] = []
    for label, value in (
        ("Est. rows", estimate_rows),
        ("Est. IO", estimate_io),
        ("Est. CPU", estimate_cpu),
        ("Subtree cost", subtree_cost),
    ):
        metric = _metric(label, value)
        if metric is not None:
            metrics.append(metric)

    subtitle = logical
    object_elem = element.find(".//{*}Object")
    if object_elem is not None:
        schema = _attr(object_elem, "Schema")
        table = _attr(object_elem, "Table")
        index = _attr(object_elem, "Index")
        parts = [part for part in (schema, table, index) if part]
        if parts:
            subtitle = ".".join(parts)

    children = [
        _parse_relop(child, child_index, prefix=f"{prefix}-{index}")
        for child_index, child in enumerate(element.findall("{*}RelOp"))
    ]

    tags: list[str] = []
    if physical in {"Clustered Index Scan", "Table Scan", "Index Scan"}:
        tags.append("full_scan")
    if subtree_cost is not None:
        try:
            if float(subtree_cost) > 10:
                tags.append("expensive")
        except ValueError:
            pass

    return PlanNode(
        id=_node_id(prefix, index),
        kind=physical,
        title=physical,
        subtitle=subtitle,
        metrics=metrics,
        tags=tags,
        children=children,
    )


def _extract_xml_text(result: QueryResult) -> str | None:
    if not result.rows:
        return None
    if len(result.columns) == 1:
        cell = result.rows[0][0]
        if cell is None:
            return None
        return str(cell)
    for row in result.rows:
        for cell in row:
            if cell is None:
                continue
            text = str(cell).strip()
            if text.startswith("<"):
                return text
    return None


def _parse_showplan_all(result: QueryResult) -> ParsedPlan:
    columns = [column.name.lower() for column in result.columns]
    stmt_idx = columns.index("stmttext") if "stmttext" in columns else None
    physical_idx = columns.index("physicalop") if "physicalop" in columns else None
    logical_idx = columns.index("logicalop") if "logicalop" in columns else None
    rows_idx = columns.index("estimaterows") if "estimaterows" in columns else None
    cost_idx = columns.index("total subtree cost") if "total subtree cost" in columns else None

    nodes: list[PlanNode] = []
    for row_index, row in enumerate(result.rows):
        physical = str(row[physical_idx]) if physical_idx is not None and row[physical_idx] is not None else "Step"
        logical = str(row[logical_idx]) if logical_idx is not None and row[logical_idx] is not None else None
        metrics: list[PlanMetric] = []
        if rows_idx is not None:
            metric = _metric("Est. rows", row[rows_idx])
            if metric is not None:
                metrics.append(metric)
        if cost_idx is not None:
            metric = _metric("Subtree cost", row[cost_idx])
            if metric is not None:
                metrics.append(metric)
        stmt = str(row[stmt_idx]) if stmt_idx is not None and row[stmt_idx] is not None else None
        nodes.append(
            PlanNode(
                id=_node_id("ms-all", row_index),
                kind=physical,
                title=physical,
                subtitle=logical or stmt,
                metrics=metrics,
            )
        )
    if nodes:
        return ParsedPlan(plan_tree=nodes, plan_format="table")
    return ParsedPlan(plan_format="table")


def parse(result: QueryResult) -> ParsedPlan:
    xml_text = _extract_xml_text(result)
    if xml_text:
        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError:
            root = None
        if root is not None:
            relops = root.findall(".//{*}RelOp")
            if relops:
                tree = [_parse_relop(relops[0], 0)]
                return ParsedPlan(plan_tree=tree, plan_format="tree")

    columns = [column.name.lower() for column in result.columns]
    if "physicalop" in columns or "stmttext" in columns:
        return _parse_showplan_all(result)

    raw_text = format_plan_text(result)
    return ParsedPlan(plan_text=raw_text, plan_format="text")
