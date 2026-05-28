import { useEffect, useId, useRef, useState } from "react";
import mermaid from "mermaid";
import type { SchemaDiagramInit } from "./types";
import { getVsCodeApi } from "./vscodeApi";

interface Props {
  init: SchemaDiagramInit;
}

export function ErDiagramView({ init }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const diagramId = useId().replace(/:/g, "");
  const [error, setError] = useState<string | null>(null);
  const vscode = getVsCodeApi();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    if (init.table_count === 0) {
      setError("No tables found in this scope.");
      el.innerHTML = "";
      return;
    }

    let cancelled = false;
    setError(null);

    const run = async (): Promise<void> => {
      try {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "dark",
          er: { useMaxWidth: true },
        });
        const { svg } = await mermaid.render(`er-${diagramId}`, init.mermaid);
        if (!cancelled) {
          el.innerHTML = svg;
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg);
          el.innerHTML = "";
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [diagramId, init.mermaid, init.table_count]);

  const copyDbml = (): void => {
    void navigator.clipboard.writeText(init.dbml);
    vscode?.postMessage({ type: "notify", message: "DBML copied to clipboard." });
  };

  return (
    <div className="er-diagram">
      <header className="er-diagram__header">
        <div>
          <h1>ER diagram — {init.scope}</h1>
          <p className="er-diagram__meta">
            {init.table_count} tables · {init.relationship_count} relationships
          </p>
        </div>
        <button type="button" className="er-diagram__btn" onClick={copyDbml}>
          Copy DBML
        </button>
      </header>
      {error ? <div className="er-diagram__error">{error}</div> : null}
      <div className="er-diagram__canvas" ref={containerRef} />
    </div>
  );
}
