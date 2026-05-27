import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import type { QueryResult } from "./types";
import { getVsCodeApi } from "./vscodeApi";

interface Props {
  result: QueryResult;
  embedded?: boolean;
}

export function ResultsTable({ result, embedded = false }: Props) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);

  const columnNames = useMemo(() => {
    if (result.columns.length > 0) {
      return result.columns.map((col) => col.name);
    }
    const width = result.rows[0]?.length ?? 0;
    return Array.from({ length: width }, (_, index) => `column_${index + 1}`);
  }, [result.columns, result.rows]);

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      columnNames.map((name) => ({
        accessorKey: name,
        header: name,
        cell: (info) => {
          const v = info.getValue();
          if (v === null || v === undefined) {
            return <span className="null-val">NULL</span>;
          }
          return String(v);
        },
      })),
    [columnNames]
  );

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

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter, sorting },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 100 } },
  });

  const { pageIndex, pageSize } = table.getState().pagination;

  return (
    <div className={`results${embedded ? " results-embedded" : ""}`}>
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
      <div className="table-wrap">
        <table>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                <th className="row-num" scope="col">
                  #
                </th>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className={header.column.getIsSorted() ? "sorted" : ""}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: " ▲", desc: " ▼" }[header.column.getIsSorted() as string] ?? ""}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                <td className="row-num">{pageIndex * pageSize + row.index + 1}</td>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
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
