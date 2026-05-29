import { useRef, useState } from "react";
import {
  DbmlErDiagram,
  type DbmlErDiagramHandle,
} from "./dbml/DbmlErDiagram";
import type { SchemaDiagramInit } from "./types";
import { getVsCodeApi } from "./vscodeApi";

interface Props {
  init: SchemaDiagramInit;
}

function encodeDbmlForDbdiagram(dbml: string): string {
  const base64 = btoa(unescape(encodeURIComponent(dbml)));
  return encodeURIComponent(base64);
}

export function ErDiagramView({ init }: Props) {
  const diagramRef = useRef<DbmlErDiagramHandle>(null);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [isFitView, setIsFitView] = useState(true);
  const vscode = getVsCodeApi();

  if (init.table_count === 0) {
    return (
      <div className="er-diagram">
        <header className="er-diagram__header">
          <div>
            <h1>ER diagram — {init.scope}</h1>
            <p className="er-diagram__meta">No tables found in this scope.</p>
          </div>
        </header>
        <div className="er-diagram__error">No tables found in this scope.</div>
      </div>
    );
  }

  const copyDbml = (): void => {
    void navigator.clipboard.writeText(init.dbml);
    vscode?.postMessage({ type: "notify", message: "DBML copied to clipboard." });
  };

  const openInDbdiagram = (): void => {
    const url = `https://dbdiagram.io/d?c=${encodeDbmlForDbdiagram(init.dbml)}`;
    vscode?.postMessage({ type: "openExternal", url });
  };

  const resetView = (): void => {
    diagramRef.current?.fitView();
    setIsFitView(true);
  };

  const handleViewportChange = (nextZoom: number, fit: boolean): void => {
    setZoomPercent(nextZoom);
    setIsFitView(fit);
  };

  return (
    <div className="er-diagram">
      <header className="er-diagram__header">
        <div>
          <h1>ER diagram — {init.scope}</h1>
          <p className="er-diagram__meta">
            {init.table_count} tables · {init.relationship_count} relationships · scroll to pan ·
            pinch or Ctrl+scroll to zoom · drag tables · autofit on open
            {!isFitView ? ` · ${zoomPercent}%` : ""}
          </p>
        </div>
        <div className="er-diagram__actions">
          {!isFitView && (
            <button type="button" className="er-diagram__btn er-diagram__btn--secondary" onClick={resetView}>
              Fit to view
            </button>
          )}
          <button type="button" className="er-diagram__btn er-diagram__btn--secondary" onClick={openInDbdiagram}>
            Open in dbdiagram.io
          </button>
          <button type="button" className="er-diagram__btn" onClick={copyDbml}>
            Copy DBML
          </button>
        </div>
      </header>
      <div className="er-diagram__viewport er-diagram__viewport--flow">
        <DbmlErDiagram
          ref={diagramRef}
          dbml={init.dbml}
          onViewportChange={handleViewportChange}
        />
      </div>
    </div>
  );
}
