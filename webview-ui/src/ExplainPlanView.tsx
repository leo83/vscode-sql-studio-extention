import { useEffect, useMemo, useState } from "react";
import { PlanTableView } from "./PlanTableView";
import { PlanTreeView } from "./PlanTreeView";
import {
  countPlanNodes,
  defaultPlanViewMode,
  filterPlanTree,
  planTreeToJson,
  planTreeToMarkdown,
} from "./planTreeUtils";
import { ResultsTable } from "./ResultsTable";
import type { StatementResult } from "./types";

interface Props {
  result: StatementResult;
}

type ViewMode = "tree" | "table" | "raw";

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard may be unavailable in some webview contexts.
  }
}

export function ExplainPlanView({ result }: Props) {
  const planText = result.plan_text?.trim() || "No execution plan returned.";
  const hasTree = Boolean(result.plan_tree?.length);
  const hasTableColumns = result.columns.length > 1 && result.rows.length > 0;
  const initialMode = defaultPlanViewMode(result.plan_format, hasTree, hasTableColumns);
  const [viewMode, setViewMode] = useState<ViewMode>(initialMode);
  const [searchQuery, setSearchQuery] = useState("");
  const [sqlExpanded, setSqlExpanded] = useState(false);
  const [expandAllSignal, setExpandAllSignal] = useState(0);
  const [collapseAllSignal, setCollapseAllSignal] = useState(0);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

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

  const filteredTree = useMemo(
    () => filterPlanTree(result.plan_tree ?? [], searchQuery),
    [result.plan_tree, searchQuery]
  );
  const nodeCount = countPlanNodes(result.plan_tree);

  const showCopyMessage = (message: string): void => {
    setCopyMessage(message);
    window.setTimeout(() => setCopyMessage(null), 1500);
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
    });
  };

  const handleCopyAsMd = async () => {
    setContextMenu(null);
    if (result.plan_tree) {
      const md = planTreeToMarkdown(result.plan_tree);
      await copyText(md);
      showCopyMessage("MD copied");
    } else {
      const md = "```\n" + planText + "\n```";
      await copyText(md);
      showCopyMessage("MD copied");
    }
  };

  const handleCopyAsJson = async () => {
    setContextMenu(null);
    if (result.plan_tree) {
      const json = planTreeToJson(result.plan_tree);
      await copyText(json);
      showCopyMessage("JSON copied");
    } else {
      showCopyMessage("No JSON plan");
    }
  };

  return (
    <div className="explain-plan" onContextMenu={handleContextMenu}>
      <div className="explain-plan-header">
        <span className="explain-plan-title">Execution plan</span>
        <span className="explain-plan-meta">
          {result.duration_ms.toFixed(1)} ms
          {nodeCount > 0 ? ` · ${nodeCount} nodes` : ""}
          {copyMessage ? ` · ${copyMessage}` : ""}
        </span>
      </div>

      {result.sql ? (
        <div className="explain-plan-sql">
          <button
            type="button"
            className="explain-plan-sql-toggle"
            aria-expanded={sqlExpanded}
            onClick={() => setSqlExpanded((value) => !value)}
          >
            {sqlExpanded ? "Hide SQL" : "Show SQL"}
          </button>
          {sqlExpanded ? <pre className="explain-plan-sql-text">{result.sql}</pre> : null}
        </div>
      ) : null}

      <div className="toolbar explain-plan-toolbar">
        <div className="view-mode-toggle" role="tablist" aria-label="Execution plan view">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "tree"}
            className={viewMode === "tree" ? "active" : ""}
            disabled={!hasTree}
            onClick={() => setViewMode("tree")}
          >
            Tree
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "table"}
            className={viewMode === "table" ? "active" : ""}
            disabled={!hasTree && !hasTableColumns}
            onClick={() => setViewMode("table")}
          >
            Table
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "raw"}
            className={viewMode === "raw" ? "active" : ""}
            onClick={() => setViewMode("raw")}
          >
            Raw
          </button>
        </div>

        <input
          type="search"
          className="plan-search-input"
          placeholder="Search plan..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          disabled={viewMode === "raw" || !hasTree}
        />

        {viewMode === "tree" && hasTree ? (
          <>
            <button type="button" onClick={() => setExpandAllSignal((value) => value + 1)}>
              Expand all
            </button>
            <button type="button" onClick={() => setCollapseAllSignal((value) => value + 1)}>
              Collapse all
            </button>
          </>
        ) : null}

        <button
          type="button"
          onClick={() => {
            void copyText(planText).then(() => showCopyMessage("Raw copied"));
          }}
        >
          Copy raw
        </button>
        {hasTree ? (
          <button
            type="button"
            onClick={() => {
              void copyText(planTreeToJson(result.plan_tree ?? [])).then(() =>
                showCopyMessage("JSON copied")
              );
            }}
          >
            Copy JSON
          </button>
        ) : null}
      </div>

      <div className="explain-plan-body">
        {viewMode === "tree" && hasTree ? (
          <PlanTreeView
            nodes={filteredTree}
            searchQuery={searchQuery}
            expandAllSignal={expandAllSignal}
            collapseAllSignal={collapseAllSignal}
          />
        ) : null}
        {viewMode === "table" ? (
          hasTree ? (
            <PlanTableView nodes={filteredTree.length ? filteredTree : result.plan_tree ?? []} />
          ) : hasTableColumns ? (
            <ResultsTable result={result} embedded showToolbar={false} />
          ) : (
            <div className="plan-empty">No tabular plan available.</div>
          )
        ) : null}
        {viewMode === "raw" ? <pre className="explain-plan-text">{planText}</pre> : null}
      </div>
      {contextMenu ? (
        <div
          className="row-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => void handleCopyAsMd()}>
            <span>Copy plan as MD</span>
          </button>
          {hasTree ? (
            <button type="button" onClick={() => void handleCopyAsJson()}>
              <span>Copy plan as JSON</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
