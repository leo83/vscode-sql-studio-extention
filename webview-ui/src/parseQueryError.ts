export interface ParsedQueryError {
  summary: string;
  code: string | null;
  hint: string | null;
  stackTrace: string | null;
  raw: string;
}

/** Split ClickHouse / Postgres error text into a short message and optional stack trace. */
export function parseQueryError(raw: string): ParsedQueryError {
  const text = raw.trim();
  if (!text) {
    return { summary: "Unknown error", code: null, hint: null, stackTrace: null, raw };
  }

  const stackStart = findStackTraceStart(text);
  const summaryPart = (stackStart >= 0 ? text.slice(0, stackStart) : text).trim();
  const stackPart =
    stackStart >= 0 ? formatStackTrace(text.slice(stackStart).trim()) : null;

  const code = summaryPart.match(/Code:\s*(\d+)/i)?.[1] ?? null;
  const hint =
    summaryPart.match(/\(([A-Z][A-Z0-9_]+)\)/)?.[1] ??
    summaryPart.match(/\[([A-Z][A-Z0-9_]+)\]/)?.[1] ??
    null;

  let summary = summaryPart
    .replace(/^Error:\s*/i, "")
    .replace(/^Code:\s*\d+\.\s*/i, "")
    .replace(/^DB::Exception:\s*/i, "")
    .replace(/\s*\([A-Z][A-Z0-9_]+\)\s*$/, "")
    .replace(/\s*\(version[^)]*\)\s*$/i, "")
    .trim();

  if (!summary) {
    summary = summaryPart;
  }

  return {
    summary,
    code,
    hint,
    stackTrace: stackPart && stackPart.length > 0 ? stackPart : null,
    raw: text,
  };
}

function findStackTraceStart(text: string): number {
  const patterns = [
    /\s0\.\s+DB::/,
    /\.\s*\(0\)\./,
    /\nStack trace:/i,
    /\n\d+\.\s+DB::/,
    /\n\d+\.\s+@/,
  ];
  let earliest = -1;
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && match.index > 20) {
      if (earliest < 0 || match.index < earliest) {
        earliest = match.index;
      }
    }
  }
  return earliest;
}

function formatStackTrace(stack: string): string {
  return stack
    .replace(/^\s*Stack trace:\s*/i, "")
    .replace(/\s(\d+)\.\s+(?=DB::)/g, "\n$1. ")
    .replace(/\.\s*\((\d+)\)\./g, "\n($1). ")
    .replace(/\s+@\s+0x/g, "\n    @ 0x")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
