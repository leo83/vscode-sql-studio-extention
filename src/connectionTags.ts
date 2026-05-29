import * as fs from "fs";
import * as vscode from "vscode";
import type { Dialect } from "./types";
import {
  TAG_PILL_GAP,
  TAG_PILL_HEIGHT,
  measureTagPillWidth,
  measureTagsRowWidth,
  tagPillSvg,
  tagsRowSvg,
} from "./tagPill";

export interface ConnectionTag {
  name: string;
  /** Palette id (e.g. "blue") or custom hex (#RRGGBB). */
  color: string;
}

export interface TagColorOption {
  id: string;
  label: string;
  hex: string;
  themeColor: string;
}

export const TAG_COLOR_OPTIONS: TagColorOption[] = [
  { id: "blue", label: "Blue", hex: "#4FC3F7", themeColor: "charts.blue" },
  { id: "green", label: "Green", hex: "#81C784", themeColor: "charts.green" },
  { id: "orange", label: "Orange", hex: "#FFB74D", themeColor: "charts.orange" },
  { id: "red", label: "Red", hex: "#E57373", themeColor: "charts.red" },
  { id: "purple", label: "Purple", hex: "#BA68C8", themeColor: "charts.purple" },
  { id: "teal", label: "Teal", hex: "#4DB6AC", themeColor: "charts.teal" },
  { id: "yellow", label: "Yellow", hex: "#FFF176", themeColor: "charts.yellow" },
  { id: "pink", label: "Pink", hex: "#F06292", themeColor: "charts.pink" },
  { id: "indigo", label: "Indigo", hex: "#7986CB", themeColor: "charts.purple" },
  { id: "lime", label: "Lime", hex: "#AED581", themeColor: "charts.green" },
  { id: "brown", label: "Brown", hex: "#A1887F", themeColor: "charts.orange" },
  { id: "gray", label: "Gray", hex: "#90A4AE", themeColor: "descriptionForeground" },
];

const COLOR_BY_ID = new Map(TAG_COLOR_OPTIONS.map((c) => [c.id, c]));

export function isCustomTagColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

export function normalizeHexColor(value: string): string | undefined {
  const trimmed = value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
    const h = trimmed.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toUpperCase();
  }
  return undefined;
}

export function tagColorHex(color: string): string {
  if (isCustomTagColor(color)) {
    return color.toUpperCase();
  }
  return COLOR_BY_ID.get(color)?.hex ?? TAG_COLOR_OPTIONS[0].hex;
}

export function tagColorOption(color: string): TagColorOption {
  if (isCustomTagColor(color)) {
    return {
      id: color,
      label: color.toUpperCase(),
      hex: color.toUpperCase(),
      themeColor: "charts.blue",
    };
  }
  return COLOR_BY_ID.get(color) ?? TAG_COLOR_OPTIONS[0];
}

export function tagColorLabel(color: string): string {
  return tagColorOption(color).label;
}

/** Black or white text for readability on a solid tag background. */
export function contrastingTextColor(hex: string): string {
  const normalized = tagColorHex(hex);
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#1A1A1A" : "#FFFFFF";
}

export function normalizeTags(tags: ConnectionTag[] | undefined): ConnectionTag[] {
  if (!tags?.length) {
    return [];
  }
  const seen = new Set<string>();
  const out: ConnectionTag[] = [];
  for (const tag of tags) {
    const name = tag.name.trim();
    if (!name) {
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const custom = normalizeHexColor(tag.color);
    const color = custom ?? (COLOR_BY_ID.has(tag.color) ? tag.color : TAG_COLOR_OPTIONS[0].id);
    out.push({ name, color });
  }
  return out;
}

export function formatTagBracketPlain(tag: ConnectionTag): string {
  return `[${tag.name}]`;
}

export function formatTagsBracketPlain(tags: ConnectionTag[] | undefined): string | undefined {
  const normalized = normalizeTags(tags);
  if (normalized.length === 0) {
    return undefined;
  }
  return normalized.map(formatTagBracketPlain).join(" ");
}

/** Explorer description: [tag] brackets + endpoint (right of connection name). */
export function formatConnectionExplorerDescription(
  tags: ConnectionTag[] | undefined,
  endpoint: string
): string {
  const tagPart = formatTagsBracketPlain(tags);
  if (!tagPart) {
    return endpoint;
  }
  return `${tagPart}  ${endpoint}`;
}

/** Object filter uses codicon in description (works on schema/database rows). */
export function formatObjectFilterDescription(filter: string): string {
  return `$(filter-filled) ${filter}`;
}

export function formatTagPillHtml(tag: ConnectionTag): string {
  const bg = tagColorHex(tag.color);
  const fg = contrastingTextColor(bg);
  return (
    `<span style="display:inline-block;padding:1px 6px;border-radius:4px;` +
    `background:${bg};color:${fg};font-size:11px;font-weight:500;line-height:16px;">` +
    `${escapeHtml(tag.name)}</span>`
  );
}

/** @deprecated Use formatTagPillHtml */
export function formatTagBracketHtml(tag: ConnectionTag): string {
  return formatTagPillHtml(tag);
}

/** @deprecated Use formatTagsBracketPlain */
export function formatTagsDescription(tags: ConnectionTag[] | undefined): string | undefined {
  return formatTagsBracketPlain(tags);
}

function svgDataUri(svg: string): vscode.Uri {
  return vscode.Uri.parse(
    `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`
  );
}

export function tagPillIconUri(tag: ConnectionTag): vscode.Uri {
  return svgDataUri(tagsRowSvg([tag]));
}

/** @deprecated Use tagPillIconUri */
export function tagBracketIconUri(tag: ConnectionTag): vscode.Uri {
  return tagPillIconUri(tag);
}

/** @deprecated Use tagPillIconUri */
export function tagBracketSvg(tag: ConnectionTag): string {
  return tagsRowSvg([tag]);
}

export function tagsRowIconUri(tags: ConnectionTag[]): vscode.Uri | undefined {
  const normalized = normalizeTags(tags);
  if (normalized.length === 0) {
    return undefined;
  }
  return svgDataUri(tagsRowSvg(normalized));
}

const DIALECT_ICON_SIZE = 16;

/** Explorer icon: dialect glyph + colored tag pills when tags exist. */
export function connectionExplorerIconUri(
  dialect: Dialect,
  tags: ConnectionTag[] | undefined,
  extensionUri: vscode.Uri
): vscode.Uri {
  const normalized = normalizeTags(tags);
  const tagsWidth = measureTagsRowWidth(normalized);
  if (tagsWidth === 0) {
    return connectionDialectIcon(dialect, extensionUri);
  }

  const dialectUri = connectionDialectIcon(dialect, extensionUri);
  const dialectPath = dialectUri.fsPath;
  let dialectFragment = "";
  try {
    const raw = fs.readFileSync(dialectPath, "utf8");
    const dialectB64 = Buffer.from(raw, "utf8").toString("base64");
    dialectFragment =
      `<image href="data:image/svg+xml;base64,${dialectB64}" ` +
      `x="0" y="0" width="${DIALECT_ICON_SIZE}" height="${DIALECT_ICON_SIZE}" ` +
      `preserveAspectRatio="xMidYMid meet"/>`;
  } catch {
    return tagsRowIconUri(normalized) ?? connectionDialectIcon(dialect, extensionUri);
  }

  const pillsStart = DIALECT_ICON_SIZE + TAG_PILL_GAP;
  let cursor = pillsStart;
  const pillFragments = normalized
    .map((tag) => {
      const fragment = tagPillSvg(tag, { x: cursor, y: 1 });
      cursor += measureTagPillWidth(tag) + TAG_PILL_GAP;
      return fragment;
    })
    .join("");

  const totalWidth = cursor - TAG_PILL_GAP;
  const height = TAG_PILL_HEIGHT + 2;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" ` +
    `viewBox="0 0 ${totalWidth} ${height}">` +
    dialectFragment +
    pillFragments +
    `</svg>`;

  return svgDataUri(svg);
}

export function formatTagsTooltip(tags: ConnectionTag[] | undefined): vscode.MarkdownString | undefined {
  const normalized = normalizeTags(tags);
  if (normalized.length === 0) {
    return undefined;
  }
  const md = new vscode.MarkdownString(
    normalized.map((t) => formatTagPillHtml(t)).join(" ")
  );
  md.supportHtml = true;
  md.isTrusted = true;
  return md;
}

export function connectionDialectIcon(
  dialect: Dialect,
  extensionUri: vscode.Uri
): vscode.Uri {
  const files: Record<Dialect, string> = {
    postgres: "postgres.svg",
    clickhouse: "clickhouse.svg",
    mssql: "mssql.svg",
    mysql: "mysql.svg",
    sqlite: "sqlite.webp",
  };
  return vscode.Uri.joinPath(extensionUri, "resources", "icons", files[dialect]);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function promptTagColor(
  title: string,
  currentColor?: string
): Promise<string | undefined> {
  type ColorPickItem = vscode.QuickPickItem & { color: string };

  const paletteItems: ColorPickItem[] = TAG_COLOR_OPTIONS.map((c) => ({
    label: c.label,
    description: c.hex,
    color: c.id,
    iconPath: new vscode.ThemeIcon("circle-filled", new vscode.ThemeColor(c.themeColor)),
  }));

  const picked = await vscode.window.showQuickPick<ColorPickItem>(
    [
      ...paletteItems,
      {
        label: "Custom hex…",
        description: "#RRGGBB",
        color: "__custom__",
        iconPath: new vscode.ThemeIcon("edit"),
      },
    ],
    {
      title,
      placeHolder: currentColor
        ? `Current: ${tagColorLabel(currentColor)} — choose a new color`
        : "Choose tag color",
    }
  );
  if (!picked) {
    return undefined;
  }
  if (picked.color === "__custom__") {
    const hex = await vscode.window.showInputBox({
      title: "Custom tag color",
      value: currentColor && isCustomTagColor(currentColor) ? currentColor : "#4FC3F7",
      validateInput: (v) => (normalizeHexColor(v) ? null : "Enter a hex color like #4FC3F7"),
    });
    return hex ? normalizeHexColor(hex) : undefined;
  }
  return picked.color;
}
