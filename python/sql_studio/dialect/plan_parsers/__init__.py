"""Parse structured EXPLAIN results into a normalized plan tree."""

from sql_studio.dialect.plan_parsers.base import parse_plan, plan_tree_to_text

__all__ = ["parse_plan", "plan_tree_to_text"]
