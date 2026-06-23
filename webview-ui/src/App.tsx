import { useCallback, useEffect, useRef, useState } from "react";
import { BatchResults } from "./BatchResults";
import { ConnectionDialog } from "./ConnectionDialog";
import { ErDiagramView } from "./ErDiagramView";
import { ExplainPlanView } from "./ExplainPlanView";
import { QueryError } from "./QueryError";
import { QueryStatus } from "./QueryStatus";
import { ResultsView } from "./ResultsView";
import type {
  ConnectionDialogInit,
  QueryExecuteResult,
  SchemaDiagramInit,
} from "./types";
import { getVsCodeApi } from "./vscodeApi";

export function App() {
  const mode = window.__SQL_STUDIO_MODE__ ?? "results";

  if (mode === "connection") {
    const init = window.__SQL_STUDIO_CONNECTION__ as ConnectionDialogInit | undefined;
    if (!init) {
      return <div className="empty">Connection dialog not initialized.</div>;
    }
    return <ConnectionDialog init={init} />;
  }

  if (mode === "diagram") {
    const init = window.__SQL_STUDIO_DIAGRAM__ as SchemaDiagramInit | undefined;
    if (!init) {
      return <div className="empty">Diagram not initialized.</div>;
    }
    return <ErDiagramView init={init} />;
  }

  return <ResultsApp />;
}

function ResultsApp() {
  const [batch, setBatch] = useState<QueryExecuteResult | undefined>(
    () => window.__SQL_STUDIO_RESULT__ as QueryExecuteResult | undefined
  );

  const pageCacheRef = useRef(new Map<number, QueryExecuteResult>());

  useEffect(() => {
    const initial = window.__SQL_STUDIO_RESULT__ as QueryExecuteResult | undefined;
    if (initial) {
      pageCacheRef.current.set(initial.statements?.[0]?.page_offset ?? 0, initial);
    }
  }, []);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as { type?: string; result?: QueryExecuteResult };
      if (msg?.type === "pageData" && msg.result) {
        const offset = msg.result.statements?.[0]?.page_offset ?? 0;
        pageCacheRef.current.set(offset, msg.result);
        setBatch(msg.result);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const handleFetchPage = useCallback((offset: number, setBusy: () => void) => {
    const cached = pageCacheRef.current.get(offset);
    if (cached) {
      setBatch(cached);
    } else {
      setBusy();
      getVsCodeApi()?.postMessage({ type: "fetchPage", offset });
    }
  }, []);

  const handlePageSizeChange = useCallback((pageSize: number, setBusy: () => void) => {
    pageCacheRef.current.clear();
    setBusy();
    getVsCodeApi()?.postMessage({ type: "fetchPage", offset: 0, limit: pageSize });
  }, []);

  const handleLoadAll = useCallback((permanently: boolean, setBusy: () => void) => {
    if (!permanently) {
      const pageSize = batch?.server_page_size ?? 500;
      const pages: typeof batch[] = [];
      let offset = 0;
      let allCached = false;
      while (true) {
        const page = pageCacheRef.current.get(offset);
        if (!page) break;
        pages.push(page);
        if (!page.statements[0]?.has_more) { allCached = true; break; }
        offset += pageSize;
      }
      if (allCached && pages.length > 0) {
        const first = pages[0]!;
        const allRows = pages.flatMap(p => p!.statements[0]?.rows ?? []);
        setBatch({
          ...first,
          fetch_mode: "client",
          server_page_size: undefined,
          statements: [{
            ...first.statements[0],
            rows: allRows,
            row_count: allRows.length,
            has_more: false,
            page_offset: 0,
          }],
        });
        return;
      }
    }
    setBusy();
    getVsCodeApi()?.postMessage({ type: "loadAll", permanently });
  }, [batch?.server_page_size]);

  if (!batch?.statements?.length) {
    return <div className="empty">No query results.</div>;
  }

  if (batch.statements.length > 1) {
    return <BatchResults batch={batch} />;
  }

  const result = batch.statements[0];
  if (result.error) {
    return <QueryError error={result.error} />;
  }
  if (result.plan_tree?.length || result.plan_text?.trim()) {
    return <ExplainPlanView result={result} />;
  }
  if (result.rows.length === 0 && !result.columns.length) {
    return <QueryStatus result={result} />;
  }
  return <ResultsView result={result} fetchMode={batch.fetch_mode} serverPageSize={batch.server_page_size} onFetchPage={handleFetchPage} onPageSizeChange={handlePageSizeChange} onLoadAll={handleLoadAll} />;
}
