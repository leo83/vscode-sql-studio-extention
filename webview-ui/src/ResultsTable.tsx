import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSizingState,
  type Row,
  type SortingState,
} from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyzeColumns, computeColumnSizes, ROW_NUM_COLUMN_WIDTH } from "./resultData";
import type { QueryResult } from "./types";
import { getVsCodeApi } from "./vscodeApi";

interface Props {
  result: QueryResult;
  embedded?: boolean;
  showToolbar?: boolean;
}

function rowToJson(row: Record<string, unknown>): string {
  return JSON.stringify(row, null, 2);
}

function isMacPlatform(): boolean {
  const platform = navigator.platform;
  const userAgent = navigator.userAgent;
  return /Mac|iPhone|iPad|iPod/.test(platform) || /Mac OS X|Macintosh/.test(userAgent);
}

function getCopyRowShortcutLabel(): string {
  return isMacPlatform() ? "⌘+⌥+C" : "Ctrl+Alt+C";
}

function getCopyValueShortcutLabel(): string {
  return isMacPlatform() ? "⌘+C" : "Ctrl+C";
}

function formatRawCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

interface ContextMenuState {
  x: number;
  y: number;
  rowId: string;
  columnId: string | null;
}

export function ResultsTable({ result, embedded = false, showToolbar = true }: Props) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const copyRowShortcutLabel = useMemo(() => getCopyRowShortcutLabel(), []);
  const copyValueShortcutLabel = useMemo(() => getCopyValueShortcutLabel(), []);

  const columnNames = useMemo(() => {
    if (result.columns.length > 0) {
      return result.columns.map((col) => col.name);
    }
    const width = result.rows[0]?.length ?? 0;
    return Array.from({ length: width }, (_, index) => `column_${index + 1}`);
  }, [result.columns, result.rows]);

  const data = useMemo(
    () =>
      result.rows.map((row) => {
        const obj: Record<string, unknown> = {};
        columnNames.forEach((name, i) => {
          obj[name] = row[i];
        });
        return obj;
      }),
    [result.rows, columnNames]
  );

  const numericColumnNames = useMemo(() => {
    const analyzed = analyzeColumns(data, result.columns);
    return new Set(analyzed.filter((col) => col.kind === "numeric").map((col) => col.name));
  }, [data, result.columns]);

  const defaultColumnSizing = useMemo(
    () => computeColumnSizes(columnNames, data),
    [columnNames, data]
  );

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      columnNames.map((name) => ({
        id: name,
        accessorKey: name,
        header: name,
        size: defaultColumnSizing[name] ?? 120,
        minSize: 48,
        maxSize: 600,
        enableResizing: true,
        cell: (info) => {
          const v = info.getValue();
          if (v === null || v === undefined) {
            return <span className="null-val">NULL</span>;
          }
          return String(v);
        },
      })),
    [columnNames, defaultColumnSizing]
  );

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter, sorting, columnSizing },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    columnResizeMode: "onChange",
    enableColumnResizing: true,
    defaultColumn: {
      minSize: 48,
      maxSize: 600,
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 100 } },
  });

  const { pageIndex, pageSize } = table.getState().pagination;
  const rows = table.getRowModel().rows;

  useEffect(() => {
    setSelectedRowId(null);
    setSelectedColumnId(null);
    setColumnSizing({});
  }, [result]);

  useEffect(() => {
    if (selectedRowId && !rows.some((row) => row.id === selectedRowId)) {
      setSelectedRowId(null);
    }
  }, [rows, selectedRowId]);

  const scrollRowIntoView = useCallback((rowId: string) => {
    const el = tableWrapRef.current?.querySelector(`tr[data-row-id="${rowId}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, []);

  const copyRow = useCallback(async (row: Row<Record<string, unknown>>) => {
    await navigator.clipboard.writeText(rowToJson(row.original));
  }, []);

  const copySelectedRow = useCallback(async () => {
    const row = rows.find((item) => item.id === selectedRowId);
    if (!row) {
      return;
    }
    await copyRow(row);
  }, [rows, selectedRowId, copyRow]);

  const copyCellValue = useCallback(
    async (row: Row<Record<string, unknown>>, columnId: string) => {
      await navigator.clipboard.writeText(formatRawCellValue(row.original[columnId]));
    },
    []
  );

  const copySelectedValue = useCallback(async () => {
    const row = rows.find((item) => item.id === selectedRowId);
    if (!row || !selectedColumnId) {
      return;
    }
    await copyCellValue(row, selectedColumnId);
  }, [rows, selectedRowId, selectedColumnId, copyCellValue]);

  const selectRow = useCallback(
    (row: Row<Record<string, unknown>>, columnId?: string) => {
      setSelectedRowId(row.id);
      if (columnId) {
        setSelectedColumnId(columnId);
      }
      tableWrapRef.current?.focus({ preventScroll: true });
      scrollRowIntoView(row.id);
    },
    [scrollRowIntoView]
  );

  const moveSelection = useCallback(
    (direction: 1 | -1) => {
      if (rows.length === 0) {
        return;
      }
      const currentIndex = selectedRowId
        ? rows.findIndex((row) => row.id === selectedRowId)
        : -1;
      let nextIndex = currentIndex + direction;
      if (currentIndex === -1) {
        nextIndex = direction === 1 ? 0 : rows.length - 1;
      } else {
        nextIndex = Math.max(0, Math.min(rows.length - 1, nextIndex));
      }
      const nextRow = rows[nextIndex];
      setSelectedRowId(nextRow.id);
      scrollRowIntoView(nextRow.id);
    },
    [rows, selectedRowId, scrollRowIntoView]
  );

  useEffect(() => {
    if (!contextMenu) {
      return;
    }
    const closeMenu = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu]);

  const columnIdFromEventTarget = (event: React.MouseEvent): string | null => {
    const cell = (event.target as HTMLElement).closest<HTMLTableCellElement>(
      "td[data-column-id]"
    );
    return cell?.dataset.columnId ?? null;
  };

  const openContextMenu = (
    event: React.MouseEvent,
    row: Row<Record<string, unknown>>,
    explicitColumnId: string | null
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const columnId =
      explicitColumnId ??
      columnIdFromEventTarget(event) ??
      (row.id === selectedRowId ? selectedColumnId : null);

    selectRow(row, columnId ?? undefined);
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      rowId: row.id,
      columnId,
    });
  };

  const handleContextMenuCopyRow = async () => {
    const row = rows.find((item) => item.id === contextMenu?.rowId);
    setContextMenu(null);
    if (!row) {
      return;
    }
    await copyRow(row);
  };

  const handleContextMenuCopyValue = async () => {
    const menu = contextMenu;
    setContextMenu(null);
    const row = rows.find((item) => item.id === menu?.rowId);
    if (!row || !menu?.columnId) {
      return;
    }
    await copyCellValue(row, menu.columnId);
  };

  const handleTableKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(-1);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c" && selectedRowId) {
      event.preventDefault();
      if (event.altKey) {
        void copySelectedRow();
        return;
      }
      if (selectedColumnId) {
        void copySelectedValue();
      }
    }
  };

  return (
    <div className={`results${embedded ? " results-embedded" : ""}${showToolbar ? "" : " results-body-only"}`}>
      {showToolbar ? (
        <div className="toolbar">
          <input
            className="filter"
            placeholder="Filter all columns..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
          />
          <span className="meta">
            {result.row_count} rows · {result.duration_ms.toFixed(1)} ms
            {result.truncated ? " · truncated" : ""}
          </span>
          <button type="button" onClick={() => getVsCodeApi()?.postMessage({ type: "exportCsv" })}>
            Export CSV
          </button>
          <button type="button" onClick={() => getVsCodeApi()?.postMessage({ type: "exportXlsx" })}>
            Export Excel
          </button>
        </div>
      ) : (
        <div className="table-toolbar">
          <input
            className="filter"
            placeholder="Filter all columns..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
          />
        </div>
      )}
      <div
        ref={tableWrapRef}
        className="table-wrap"
        tabIndex={0}
        onKeyDown={handleTableKeyDown}
        onContextMenu={(event) => event.preventDefault()}
      >
        <table style={{ width: table.getTotalSize() + ROW_NUM_COLUMN_WIDTH }}>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                <th
                  className="row-num"
                  scope="col"
                  style={{ width: ROW_NUM_COLUMN_WIDTH }}
                >
                  #
                </th>
                {hg.headers.map((header) => {
                  const isNumeric = numericColumnNames.has(header.column.id);
                  const classes = [
                    header.column.getIsSorted() ? "sorted" : "",
                    isNumeric ? "cell-numeric" : "cell-text",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <th
                      key={header.id}
                      style={{ width: header.getSize() }}
                      onClick={header.column.getToggleSortingHandler()}
                      className={classes}
                    >
                      <span className="th-label">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{ asc: " ▲", desc: " ▼" }[header.column.getIsSorted() as string] ?? ""}
                      </span>
                      <div
                        className={`col-resizer${header.column.getIsResizing() ? " is-resizing" : ""}`}
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                data-row-id={row.id}
                className={row.id === selectedRowId ? "row-selected" : undefined}
                onClick={() => selectRow(row)}
                onContextMenu={(event) => openContextMenu(event, row, null)}
              >
                <td className="row-num">{pageIndex * pageSize + row.index + 1}</td>
                {row.getVisibleCells().map((cell) => {
                  const isSelectedCell =
                    row.id === selectedRowId && cell.column.id === selectedColumnId;
                  return (
                  <td
                    key={cell.id}
                    data-column-id={cell.column.id}
                    style={{ width: cell.column.getSize() }}
                    className={[
                      numericColumnNames.has(cell.column.id) ? "cell-numeric" : "cell-text",
                      isSelectedCell ? "cell-selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={(event) => {
                      event.stopPropagation();
                      selectRow(row, cell.column.id);
                    }}
                    onContextMenu={(event) => openContextMenu(event, row, cell.column.id)}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {contextMenu ? (
          <div
            className="row-context-menu"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" onClick={() => void handleContextMenuCopyRow()}>
              <span>Copy row</span>
              <span className="row-context-menu-shortcut">{copyRowShortcutLabel}</span>
            </button>
            <button
              type="button"
              disabled={!contextMenu.columnId}
              onClick={() => void handleContextMenuCopyValue()}
            >
              <span>Copy value</span>
              <span className="row-context-menu-shortcut">{copyValueShortcutLabel}</span>
            </button>
          </div>
        ) : null}
      </div>
      <div className="pagination">
        <button type="button" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
          Prev
        </button>
        <span>
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
        </span>
        <button type="button" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          Next
        </button>
        <select
          value={table.getState().pagination.pageSize}
          onChange={(e) => table.setPageSize(Number(e.target.value))}
        >
          {[50, 100, 500, 1000].map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
