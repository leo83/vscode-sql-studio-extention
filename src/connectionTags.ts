import * as vscode from "vscode";
import type { Dialect } from "./types";

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

/** Explorer description: colored bracket tags are plain text here (TreeView description is string-only). */
export function formatConnectionExplorerDescription(
  tags: ConnectionTag[] | undefined,
  endpoint: string
): string {
  const tagPart = formatTagsBracketPlain(tags);
  return tagPart ? `${tagPart}  ${endpoint}` : endpoint;
}

export function formatTagBracketHtml(tag: ConnectionTag): string {
  const color = tagColorHex(tag.color);
  return (
    `<span style="color:${color};font-weight:600;">[${escapeHtml(tag.name)}]</span>`
  );
}

/** @deprecated Use formatTagsBracketPlain */
export function formatTagsDescription(tags: ConnectionTag[] | undefined): string | undefined {
  return formatTagsBracketPlain(tags);
}

/** @deprecated Use formatTagBracketHtml */
export function formatTagPillHtml(tag: ConnectionTag): string {
  return formatTagBracketHtml(tag);
}

function svgDataUri(svg: string): vscode.Uri {
  return vscode.Uri.parse(
    `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`
  );
}

/** SVG bracket tag for Quick Pick icons. */
export function tagBracketSvg(tag: ConnectionTag, fontSize = 11): string {
  const text = `[${tag.name}]`;
  const color = tagColorHex(tag.color);
  const charW = fontSize * 0.55;
  const width = Math.ceil(text.length * charW + 2);
  const height = Math.ceil(fontSize + 4);
  const textY = fontSize + 1;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">` +
    `<text x="1" y="${textY}" fill="${color}" font-size="${fontSize}" ` +
    `font-family="system-ui,-apple-system,sans-serif" font-weight="600">${escapeXml(text)}</text>` +
    `</svg>`
  );
}

export function tagBracketIconUri(tag: ConnectionTag): vscode.Uri {
  return svgDataUri(tagBracketSvg(tag));
}

/** @deprecated Use tagBracketIconUri */
export function tagPillIconUri(tag: ConnectionTag): vscode.Uri {
  return tagBracketIconUri(tag);
}

export function formatTagsTooltip(tags: ConnectionTag[] | undefined): vscode.MarkdownString | undefined {
  const normalized = normalizeTags(tags);
  if (normalized.length === 0) {
    return undefined;
  }
  const md = new vscode.MarkdownString(
    normalized.map((t) => formatTagBracketHtml(t)).join(" ")
  );
  md.supportHtml = true;
  md.isTrusted = true;
  return md;
}

export function connectionDialectIcon(
  dialect: Dialect,
  extensionUri: vscode.Uri
): vscode.Uri {
  const file = dialect === "clickhouse" ? "clickhouse.svg" : "postgres.svg";
  return vscode.Uri.joinPath(extensionUri, "resources", "icons", file);
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
