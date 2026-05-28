"""CSV export utilities."""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Any, Sequence


def export_csv(
    path: str | Path,
    columns: Sequence[str],
    rows: Sequence[Sequence[Any]],
    *,
    bom: bool = True,
) -> int:
    file_path = Path(path)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    mode = "w"
    encoding = "utf-8-sig" if bom else "utf-8"
    with file_path.open(mode, encoding=encoding, newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(columns)
        for row in rows:
            writer.writerow(["" if v is None else v for v in row])
    return len(rows)
