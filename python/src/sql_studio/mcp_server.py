#!/usr/bin/env python3
"""Minimal MCP stub listing connections — extend in phase 3."""

from __future__ import annotations

import json
import sys


def main() -> None:
    # Placeholder: read JSON-RPC from stdin for MCP protocol bootstrap
    sys.stderr.write("SQL Studio MCP server placeholder. Use extension commands for now.\n")
    sys.stderr.flush()
    print(json.dumps({"tools": []}))


if __name__ == "__main__":
    main()
