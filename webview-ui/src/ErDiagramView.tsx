import { useEffect, useId, useRef, useState } from "react";
import mermaid from "mermaid";
import {
  attachErDiagramGestures,
  computeAutofitTransform,
  ER_DIAGRAM_FIT_PADDING,
  ER_DIAGRAM_STAGE_PADDING,
  type DiagramTransform,
  transformsEqual,
} from "./erDiagramGestures";
import type { SchemaDiagramInit } from "./types";
import { getVsCodeApi } from "./vscodeApi";

interface Props {
  init: SchemaDiagramInit;
}

const INITIAL_TRANSFORM: DiagramTransform = { scale: 1, x: ER_DIAGRAM_FIT_PADDING, y: ER_DIAGRAM_FIT_PADDING };

function measureDiagramContent(canvas: HTMLElement): { width: number; height: number } {
  const svg = canvas.querySelector("svg");
  if (!svg) {
    return { width: 0, height: 0 };
  }
  const bbox = svg.getBBox();
  return {
    width: bbox.width + ER_DIAGRAM_STAGE_PADDING * 2,
    height: bbox.height + ER_DIAGRAM_STAGE_PADDING * 2,
  };
}

function measureAutofitTransform(
  viewport: HTMLElement,
  canvas: HTMLElement
): DiagramTransform {
  return computeAutofitTransform(
    { width: viewport.clientWidth, height: viewport.clientHeight },
    measureDiagramContent(canvas)
  );
}

export function ErDiagramView({ init }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<DiagramTransform>(INITIAL_TRANSFORM);
  const fitTransformRef = useRef<DiagramTransform>(INITIAL_TRANSFORM);
  const diagramId = useId().replace(/:/g, "");
  const [error, setError] = useState<string | null>(null);
  const [diagramReady, setDiagramReady] = useState(false);
  const [transform, setTransform] = useState<DiagramTransform>(INITIAL_TRANSFORM);
  const vscode = getVsCodeApi();

  transformRef.current = transform;

  const updateTransform = (next: DiagramTransform): void => {
    transformRef.current = next;
    setTransform(next);
  };

  useEffect(() => {
    setTransform(INITIAL_TRANSFORM);
    transformRef.current = INITIAL_TRANSFORM;
    fitTransformRef.current = INITIAL_TRANSFORM;
    setDiagramReady(false);
  }, [init.mermaid]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) {
      return;
    }
    if (init.table_count === 0) {
      setError("No tables found in this scope.");
      el.innerHTML = "";
      setDiagramReady(false);
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
          er: { useMaxWidth: false },
        });
        const { svg } = await mermaid.render(`er-${diagramId}`, init.mermaid);
        if (!cancelled) {
          el.innerHTML = svg;
          setDiagramReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg);
          el.innerHTML = "";
          setDiagramReady(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [diagramId, init.mermaid, init.table_count]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !canvas || !diagramReady || error) {
      return;
    }

    const applyAutofit = (): void => {
      const fit = measureAutofitTransform(viewport, canvas);
      fitTransformRef.current = fit;
      updateTransform(fit);
    };

    applyAutofit();

    const observer = new ResizeObserver(() => {
      const previousFit = fitTransformRef.current;
      const fit = measureAutofitTransform(viewport, canvas);
      fitTransformRef.current = fit;
      if (transformsEqual(transformRef.current, previousFit)) {
        updateTransform(fit);
      }
    });
    observer.observe(viewport);

    const handlers = attachErDiagramGestures(
      viewport,
      () => transformRef.current,
      updateTransform
    );
    return () => {
      observer.disconnect();
      handlers.dispose();
    };
  }, [diagramReady, error]);

  const copyDbml = (): void => {
    void navigator.clipboard.writeText(init.dbml);
    vscode?.postMessage({ type: "notify", message: "DBML copied to clipboard." });
  };

  const resetView = (): void => {
    updateTransform(fitTransformRef.current);
  };

  const isFitView = transformsEqual(transform, fitTransformRef.current);
  const zoomPercent = Math.round(transform.scale * 100);

  return (
    <div className="er-diagram">
      <header className="er-diagram__header">
        <div>
          <h1>ER diagram — {init.scope}</h1>
          <p className="er-diagram__meta">
            {init.table_count} tables · {init.relationship_count} relationships ·{" "}
            scroll to pan · pinch or Ctrl+scroll to zoom
            {!isFitView ? ` · ${zoomPercent}%` : ""}
          </p>
        </div>
        <div className="er-diagram__actions">
          {!isFitView && (
            <button type="button" className="er-diagram__btn er-diagram__btn--secondary" onClick={resetView}>
              Fit to view
            </button>
          )}
          <button type="button" className="er-diagram__btn" onClick={copyDbml}>
            Copy DBML
          </button>
        </div>
      </header>
      {error ? <div className="er-diagram__error">{error}</div> : null}
      <div className="er-diagram__viewport er-diagram__viewport--pannable" ref={viewportRef}>
        <div
          className="er-diagram__stage"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          }}
        >
          <div className="er-diagram__canvas" ref={canvasRef} />
        </div>
      </div>
    </div>
  );
}
