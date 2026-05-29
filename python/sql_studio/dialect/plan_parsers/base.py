"""Plan parsing entry point and shared helpers."""

from __future__ import annotations

import json
import re
from typing import Any

from sql_studio.models import ParsedPlan, PlanFormat, PlanMetric, PlanNode, QueryResult, StatementResult


def _node_id(prefix: str, index: int) -> str:
    return f"{prefix}-{index}"


def _metric(label: str, value: Any) -> PlanMetric | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return PlanMetric(label=label, value=str(value))
    if isinstance(value, (int, float, str)):
        return PlanMetric(label=label, value=value)
    return PlanMetric(label=label, value=str(value))


def _extract_kind(title: str) -> str:
    match = re.match(r"^([A-Za-z][A-Za-z0-9_]*)", title.strip())
    if match:
        return match.group(1)
    match = re.match(r"^([^(]+)", title.strip())
    if match:
        return match.group(1).strip()
    return title.strip() or "Step"


def _parse_subtitle(title: str) -> tuple[str, str | None]:
    if ": (" in title:
        return title.strip(), None
    match = re.match(r"^([^(]+)\((.+)\)\s*$", title.strip())
    if match:
        return match.group(1).strip(), match.group(2).strip()
    return title.strip(), None


def plan_tree_to_text(nodes: list[PlanNode], indent: int = 0) -> str:
    lines: list[str] = []
    for node in nodes:
        prefix = "  " * indent
        line = f"{prefix}{node.title}"
        if node.subtitle and node.subtitle not in node.title:
            line = f"{prefix}{node.title} ({node.subtitle})"
        lines.append(line)
        if node.metrics:
            metric_text = ", ".join(f"{m.label}: {m.value}" for m in node.metrics)
            lines.append(f"{prefix}  [{metric_text}]")
        if node.children:
            child_text = plan_tree_to_text(node.children, indent + 1)
            if child_text:
                lines.append(child_text)
    return "\n".join(lines)


def parse_indented_text_plan(text: str, *, prefix: str = "text") -> list[PlanNode]:
    """Parse indentation-based text plans (ClickHouse text fallback, Postgres TEXT)."""
    lines = [line.rstrip() for line in text.splitlines() if line.strip()]
    if not lines:
        return []

    indents = [len(line) - len(line.lstrip(" ")) for line in lines]
    nodes: list[PlanNode] = []
    stack: list[tuple[int, PlanNode]] = []

    for index, line in enumerate(lines):
        indent = indents[index]
        content = line.strip()
        kind = _extract_kind(content)
        title, subtitle = _parse_subtitle(content)
        node = PlanNode(
            id=_node_id(prefix, index),
            kind=kind,
            title=title,
            subtitle=subtitle,
        )
        while stack and stack[-1][0] >= indent:
            stack.pop()
        if stack:
            stack[-1][1].children.append(node)
        else:
            nodes.append(node)
        stack.append((indent, node))
    return nodes


def _extract_json_cell(result: QueryResult) -> Any | None:
    if not result.rows:
        return None
    if len(result.columns) != 1:
        return None
    cell = result.rows[0][0]
    if isinstance(cell, (dict, list)):
        return cell
    if cell is None:
        return None
    text = str(cell).strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def format_plan_text(result: QueryResult | StatementResult) -> str | None:
    if result.error:
        return None
    if not result.rows:
        message = (result.status_message or "").strip()
        return message or "No execution plan returned."

    if len(result.columns) == 1:
        lines: list[str] = []
        for row in result.rows:
            if not row:
                continue
            cell = row[0]
            if cell is None:
                continue
            if isinstance(cell, (dict, list)):
                lines.append(json.dumps(cell, indent=2, default=str))
            else:
                lines.append(str(cell))
        joined = "\n".join(lines).strip()
        return joined or None

    header = " | ".join(column.name for column in result.columns)
    body_lines: list[str] = []
    for row in result.rows:
        cells = ["" if value is None else str(value) for value in row]
        body_lines.append(" | ".join(cells))
    return "\n".join([header, "-" * min(len(header), 80), *body_lines])


def parse_plan(dialect: str, result: QueryResult | StatementResult) -> ParsedPlan:
    from sql_studio.dialect.plan_parsers import clickhouse, mssql, mysql, postgres, sqlite

    raw_text = format_plan_text(result)
    if result.error:
        return ParsedPlan(plan_text=raw_text, plan_format="text")

    parsers = {
        "postgres": postgres.parse,
        "clickhouse": clickhouse.parse,
        "mysql": mysql.parse,
        "sqlite": sqlite.parse,
        "mssql": mssql.parse,
    }
    parser = parsers.get(dialect)
    if parser is None:
        return _fallback_from_text(raw_text)

    try:
        parsed = parser(result)
    except Exception:
        return _fallback_from_text(raw_text)

    if parsed.plan_tree:
        if not parsed.plan_text:
            parsed = parsed.model_copy(
                update={"plan_text": plan_tree_to_text(parsed.plan_tree) or raw_text}
            )
        return parsed

    if raw_text and parsed.plan_format == "table":
        return parsed.model_copy(update={"plan_text": raw_text})

    return _fallback_from_text(raw_text)


def _fallback_from_text(raw_text: str | None) -> ParsedPlan:
    if not raw_text:
        return ParsedPlan(plan_text="No execution plan returned.", plan_format="text")
    tree = parse_indented_text_plan(raw_text)
    if tree:
        return ParsedPlan(
            plan_tree=tree,
            plan_text=raw_text,
            plan_format="tree",
        )
    return ParsedPlan(plan_text=raw_text, plan_format="text")
