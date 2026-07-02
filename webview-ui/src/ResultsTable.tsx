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
  type VisibilityState,
} from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { IconChevronLeft, IconChevronRight, IconChevronsLeft, IconChevronsRight, IconDownload, IconExpandAll, IconEye } from "./Icons";
import {
  appendEqualsClause,
  distinctValuesForColumn,
  parseColumnFilter,
  rowMatchesFilter,
} from "./columnFilter";
import { analyzeColumns, computeColumnSizes, ROW_NUM_COLUMN_WIDTH } from "./resultData";
import type { QueryResult } from "./types";
import { getVsCodeApi } from "./vscodeApi";

// Max distinct values for which the right-click "Filter values" submenu is offered.
const FILTER_VALUES_LIMIT = 50;

const FILTER_PLACEHOLDER = 'Filter rows… or col=value, col!=v, col in (a,b), AND / OR';

interface Props {
  result: QueryResult;
  embedded?: boolean;
  showToolbar?: boolean;
  fetchMode?: "server" | "client";
  serverPageSize?: number;
  isBusy?: boolean;
  elapsedSeconds?: number;
  onBusyStart?: () => void;
  onFetchPage?: (offset: number, setBusy: () => void) => void;
  onPageSizeChange?: (pageSize: number, setBusy: () => void) => void;
  onLoadAll?: (permanently: boolean, setBusy: () => void) => void;
  // Optional controlled filter state. When provided, the filter text is owned by
  // the parent so it survives this component unmounting (e.g. switching to the
  // chart view) and can be shared with the chart. Falls back to internal state.
  globalFilter?: string;
  setGlobalFilter?: Dispatch<SetStateAction<string>>;
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
  rowId: string | null;
  columnId: string | null;
}

export function ResultsTable({ result, embedded = false, showToolbar = true, fetchMode, serverPageSize, isBusy = false, elapsedSeconds = 0, onBusyStart, onFetchPage, onPageSizeChange, onLoadAll, globalFilter: controlledFilter, setGlobalFilter: controlledSetFilter }: Props) {
  const [internalFilter, setInternalFilter] = useState("");
  const globalFilter = controlledFilter !== undefined ? controlledFilter : internalFilter;
  const setGlobalFilter = controlledSetFilter ?? setInternalFilter;
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 100 });
  const [draggingColId, setDraggingColId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);
  const draggingColRef = useRef<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [valuesSubmenuOpen, setValuesSubmenuOpen] = useState(false);
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

  const colFilter = useMemo(
    () => parseColumnFilter(globalFilter, columnNames),
    [globalFilter, columnNames]
  );

  const displayData = useMemo(() => {
    if (!colFilter) return data;
    return data.filter((row) => rowMatchesFilter(row, colFilter));
  }, [data, colFilter]);

  const isFiltered = colFilter !== null;
  const filteredCount = displayData.length;

  const numericColumnNames = useMemo(() => {
    const analyzed = analyzeColumns(data, result.columns);
    return new Set(analyzed.filter((col) => col.kind === "numeric").map((col) => col.name));
  }, [data, result.columns]);

  const defaultColumnSizing = useMemo(
    () => computeColumnSizes(columnNames, data),
    [columnNames, data]
  );

  const effectiveOrderRef = useRef<string[]>([]);
  effectiveOrderRef.current = columnOrder.length > 0 ? columnOrder : columnNames;

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      columnNames.map((name) => ({
        id: name,
        accessorFn: (row) => row[name],
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
          const str = String(v);
          if (str.startsWith("https://") || str.startsWith("http://")) {
            return (
              <a
                href={str}
                title={str}
                onClick={(e) => {
                  e.preventDefault();
                  getVsCodeApi()?.postMessage({ type: "openUrl", url: str });
                }}
              >
                {str}
              </a>
            );
          }
          return str;
        },
      })),
    [columnNames, defaultColumnSizing]
  );

  const columnNamesKey = useMemo(() => columnNames.join(","), [columnNames]);

  const table = useReactTable({
    data: displayData,
    columns,
    state: {
      globalFilter: colFilter ? "" : globalFilter,
      sorting,
      columnSizing,
      columnOrder,
      columnVisibility,
      ...(fetchMode !== "server" ? { pagination } : {}),
    },
    onGlobalFilterChange: (updater) => {
      const current = colFilter ? "" : globalFilter;
      const next = typeof updater === "function" ? (updater as (old: string) => string)(current) : updater;
      // While a structured filter is active we feed TanStack an empty global filter,
      // so a table reconfiguration (e.g. fetch-mode change) can echo "" back here.
      // Ignore that — the user's typed expression must not be silently cleared.
      // The visible filter input calls setGlobalFilter directly, so explicit clears
      // still work.
      if (colFilter && next === "") {
        return;
      }
      setGlobalFilter(next);
    },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    onColumnOrderChange: setColumnOrder,
    onColumnVisibilityChange: setColumnVisibility,
    columnResizeMode: "onChange",
    enableColumnResizing: true,
    defaultColumn: {
      minSize: 48,
      maxSize: 600,
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(fetchMode !== "server"
      ? { getPaginationRowModel: getPaginationRowModel(), onPaginationChange: setPagination }
      : {}),
  });

  const rows = table.getRowModel().rows;
  const rowNumOffset = fetchMode === "server" ? (result.page_offset ?? 0) : 0;

  useEffect(() => {
    setSelectedRowId(null);
    setSelectedColumnId(null);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [result]);

  useEffect(() => {
    setColumnSizing({});
    setColumnOrder([]);
    setColumnVisibility({});
  }, [columnNamesKey]);

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

  const copyColumnName = useCallback(async (columnId: string) => {
    await navigator.clipboard.writeText(columnId);
  }, []);

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
    const closeMenu = () => {
      setContextMenu(null);
      setValuesSubmenuOpen(false);
    };
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
    setValuesSubmenuOpen(false);
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      rowId: row.id,
      columnId,
    });
  };

  const openHeaderContextMenu = (event: React.MouseEvent, columnId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedColumnId(columnId);
    setValuesSubmenuOpen(false);
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      rowId: null,
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

  const handleContextMenuCopyColumnName = async () => {
    const columnId = contextMenu?.columnId;
    setContextMenu(null);
    if (!columnId) {
      return;
    }
    await copyColumnName(columnId);
  };

  const handleContextMenuHideColumn = () => {
    const columnId = contextMenu?.columnId;
    setContextMenu(null);
    if (!columnId) return;
    table.getColumn(columnId)?.toggleVisibility(false);
  };

  const menuColumnId = contextMenu?.columnId ?? null;
  const filterableValues = useMemo(
    () => (menuColumnId ? distinctValuesForColumn(data, menuColumnId, FILTER_VALUES_LIMIT) : null),
    [menuColumnId, data]
  );

  const applyValueFilter = (value: string | null) => {
    if (!menuColumnId) return;
    setGlobalFilter((current) => appendEqualsClause(current, menuColumnId, value, columnNames));
    setContextMenu(null);
    setValuesSubmenuOpen(false);
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

  const serverPageSizeOptions = (() => {
    const base = [50, 100, 500, 1000];
    const current = serverPageSize ?? 500;
    return base.includes(current) ? base : [...base, current].sort((a, b) => a - b);
  })();

  return (
    <div className={`results${embedded ? " results-embedded" : ""}${showToolbar ? "" : " results-body-only"}`}>
      {showToolbar ? (
        <div className="toolbar">
          <div className="filter-wrap">
            <input
              className="filter"
              placeholder={FILTER_PLACEHOLDER}
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
            />
            {globalFilter ? (
              <button
                type="button"
                className="filter-clear"
                title="Clear filter"
                aria-label="Clear filter"
                onClick={() => setGlobalFilter("")}
              >
                ×
              </button>
            ) : null}
          </div>
          <span className="meta">
            {isFiltered
              ? `${filteredCount} of ${result.row_count} rows`
              : `${result.row_count} rows`}{" "}
            · {result.duration_ms.toFixed(1)} ms
            {result.has_more ? " · more" : result.truncated ? " · truncated" : ""}
          </span>
          {table.getAllLeafColumns().some((c) => !c.getIsVisible()) ? (
            <button type="button" onClick={() => table.resetColumnVisibility()}>
              <IconEye />Show all columns
            </button>
          ) : null}
          <button type="button" onClick={() => getVsCodeApi()?.postMessage({ type: "exportCsv" })}>
            <IconDownload />Export CSV
          </button>
          <button type="button" onClick={() => getVsCodeApi()?.postMessage({ type: "exportXlsx" })}>
            <IconDownload />Export Excel
          </button>
        </div>
      ) : (
        <div className="table-toolbar">
          <div className="filter-wrap">
            <input
              className="filter"
              placeholder={FILTER_PLACEHOLDER}
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
            />
            {globalFilter ? (
              <button
                type="button"
                className="filter-clear"
                title="Clear filter"
                aria-label="Clear filter"
                onClick={() => setGlobalFilter("")}
              >
                ×
              </button>
            ) : null}
          </div>
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
                  const isDragging = draggingColId === header.column.id;
                  const isDropTarget = dragOverColId === header.column.id && !isDragging;
                  const classes = [
                    header.column.getIsSorted() ? "sorted" : "",
                    isNumeric ? "cell-numeric" : "cell-text",
                    isDragging ? "th-dragging" : "",
                    isDropTarget ? "th-drop-target" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <th
                      key={header.id}
                      data-column-id={header.column.id}
                      style={{ width: header.getSize() }}
                      onClick={header.column.getToggleSortingHandler()}
                      onContextMenu={(event) => openHeaderContextMenu(event, header.column.id)}
                      className={classes}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (draggingColRef.current && draggingColRef.current !== header.column.id) {
                          setDragOverColId(header.column.id);
                        }
                      }}
                      onDragLeave={() => setDragOverColId(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        const src = draggingColRef.current;
                        if (!src || src === header.column.id) {
                          setDragOverColId(null);
                          return;
                        }
                        const current = effectiveOrderRef.current;
                        const newOrder = [...current];
                        const fromIdx = newOrder.indexOf(src);
                        const toIdx = newOrder.indexOf(header.column.id);
                        if (fromIdx >= 0 && toIdx >= 0) {
                          newOrder.splice(fromIdx, 1);
                          newOrder.splice(toIdx, 0, src);
                          setColumnOrder(newOrder);
                        }
                        setDragOverColId(null);
                      }}
                    >
                      <span
                        className="th-label"
                        draggable={true}
                        onDragStart={() => {
                          draggingColRef.current = header.column.id;
                          setDraggingColId(header.column.id);
                        }}
                        onDragEnd={() => {
                          draggingColRef.current = null;
                          setDraggingColId(null);
                          setDragOverColId(null);
                        }}
                      >
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
                <td className="row-num">{rowNumOffset + row.index + 1}</td>
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
                    title={cell.getValue() != null ? String(cell.getValue()) : undefined}
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
            {contextMenu.rowId ? (
              <button type="button" onClick={() => void handleContextMenuCopyRow()}>
                <span>Copy row</span>
                <span className="row-context-menu-shortcut">{copyRowShortcutLabel}</span>
              </button>
            ) : null}
            {contextMenu.rowId && contextMenu.columnId ? (
              <button
                type="button"
                onClick={() => void handleContextMenuCopyValue()}
              >
                <span>Copy value</span>
                <span className="row-context-menu-shortcut">{copyValueShortcutLabel}</span>
              </button>
            ) : null}
            {contextMenu.columnId ? (
              <button type="button" onClick={() => void handleContextMenuCopyColumnName()}>
                <span>Copy column name</span>
              </button>
            ) : null}
            {contextMenu.columnId ? (
              <button type="button" onClick={handleContextMenuHideColumn}>
                <span>Hide column</span>
              </button>
            ) : null}
            {contextMenu.columnId ? (
              filterableValues ? (
                <div
                  className="row-context-submenu-item"
                  onMouseEnter={() => setValuesSubmenuOpen(true)}
                  onMouseLeave={() => setValuesSubmenuOpen(false)}
                >
                  <button type="button" onClick={() => setValuesSubmenuOpen((v) => !v)}>
                    <span>Filter values</span>
                    <span className="row-context-menu-shortcut">▸</span>
                  </button>
                  {valuesSubmenuOpen ? (
                    <div
                      className={`row-context-submenu${
                        contextMenu.x > window.innerWidth - 320 ? " submenu-left" : ""
                      }${
                        // "Filter values" is the last menu item (~130px below the click),
                        // so flip the value list upward well before the raw click nears the edge.
                        contextMenu.y > window.innerHeight - 480 ? " submenu-up" : ""
                      }`}
                    >
                      <div className="row-context-submenu-hint">loaded rows</div>
                      {filterableValues.hasNull ? (
                        <button type="button" onClick={() => applyValueFilter(null)}>
                          <span className="null-val">NULL</span>
                        </button>
                      ) : null}
                      {filterableValues.values.map((value) => (
                        <button key={value} type="button" onClick={() => applyValueFilter(value)}>
                          <span>{value === "" ? "(empty)" : value}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <button type="button" disabled>
                  <span>Filter values</span>
                  <span className="row-context-menu-shortcut">{FILTER_VALUES_LIMIT}+</span>
                </button>
              )
            ) : null}
          </div>
        ) : null}
      </div>
      {fetchMode === "server" ? (
        <div className="pagination">
          <button
            type="button"
            title="First page"
            onClick={() => {
              if (onFetchPage) {
                onFetchPage(0, () => onBusyStart?.());
              } else {
                onBusyStart?.();
                getVsCodeApi()?.postMessage({ type: "fetchPage", offset: 0 });
              }
            }}
            disabled={(result.page_offset ?? 0) === 0 || isBusy}
          >
            <IconChevronsLeft />First
          </button>
          <button
            type="button"
            onClick={() => {
              const offset = result.page_offset ?? 0;
              const pageSize = serverPageSize ?? (result.row_count || 1);
              const prevOffset = Math.max(0, offset - pageSize);
              if (onFetchPage) {
                onFetchPage(prevOffset, () => onBusyStart?.());
              } else {
                onBusyStart?.();
                getVsCodeApi()?.postMessage({ type: "fetchPage", offset: prevOffset });
              }
            }}
            disabled={(result.page_offset ?? 0) === 0 || isBusy}
          >
            <IconChevronLeft />Prev
          </button>
          <span>
            Rows {(result.page_offset ?? 0) + 1}–{(result.page_offset ?? 0) + result.row_count}
            {result.has_more ? "+" : ""}
          </span>
          <button
            type="button"
            onClick={() => {
              const nextOffset = (result.page_offset ?? 0) + result.row_count;
              if (onFetchPage) {
                onFetchPage(nextOffset, () => onBusyStart?.());
              } else {
                onBusyStart?.();
                getVsCodeApi()?.postMessage({ type: "fetchPage", offset: nextOffset });
              }
            }}
            disabled={!result.has_more || isBusy}
          >
            Next<IconChevronRight />
          </button>
          {isBusy && <span className="pagination-loading">{elapsedSeconds}s…</span>}
          {onPageSizeChange != null && (
            <select
              value={serverPageSize ?? 500}
              disabled={isBusy}
              onChange={(e) => onPageSizeChange(Number(e.target.value), () => onBusyStart?.())}
            >
              {serverPageSizeOptions.map((n) => (
                <option key={n} value={n}>{n} / page</option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="load-all-btn"
            disabled={isBusy}
            title="Choose how many rows to load"
            onClick={() => getVsCodeApi()?.postMessage({ type: "changeLimit" })}
          >
            <IconExpandAll />Load all rows
          </button>
        </div>
      ) : (
        <div className="pagination">
          <button
            type="button"
            title="First page"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <IconChevronsLeft />First
          </button>
          <button type="button" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            <IconChevronLeft />Prev
          </button>
          <span>
            Page {pagination.pageIndex + 1} of {table.getPageCount()}
          </span>
          <button type="button" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Next<IconChevronRight />
          </button>
          <button
            type="button"
            title="Last page"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            Last<IconChevronsRight />
          </button>
          <select
            value={pagination.pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
          >
            {[50, 100, 500, 1000].map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
          {result.truncated && (
            <button
              type="button"
              className="load-all-btn"
              title="Choose how many rows to load"
              onClick={() => getVsCodeApi()?.postMessage({ type: "changeLimit" })}
            >
              <IconExpandAll />Load all rows
            </button>
          )}
        </div>
      )}
    </div>
  );
}
