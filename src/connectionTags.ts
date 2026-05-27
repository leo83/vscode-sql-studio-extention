import * as vscode from "vscode";

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

export function formatTagsDescription(tags: ConnectionTag[] | undefined): string | undefined {
  const normalized = normalizeTags(tags);
  if (normalized.length === 0) {
    return undefined;
  }
  return normalized.map((t) => t.name).join("  ");
}

/** Plain description: tag names + dialect/host (always shown together). */
export function formatConnectionExplorerDescriptionText(
  tags: ConnectionTag[] | undefined,
  dialectDesc: string
): string {
  const tagDesc = formatTagsDescription(tags);
  return tagDesc ? `${tagDesc}  ${dialectDesc}` : dialectDesc;
}

export function formatTagPillHtml(tag: ConnectionTag): string {
  const bg = tagColorHex(tag.color);
  const fg = contrastingTextColor(bg);
  return (
    `<span style="display:inline-block;background:${bg};color:${fg};` +
    `padding:0 5px;border-radius:3px;margin-left:3px;` +
    `font-size:10px;font-weight:600;line-height:15px;white-space:nowrap;">` +
    `${escapeHtml(tag.name)}</span>`
  );
}

/** SVG pill icon for Quick Pick / tree decorations. */
export function tagPillSvg(tag: ConnectionTag, fontSize = 10): string {
  const bg = tagColorHex(tag.color);
  const fg = contrastingTextColor(bg);
  const padX = 5;
  const padY = 2;
  const charW = fontSize * 0.58;
  const textW = Math.max(tag.name.length * charW, fontSize);
  const width = Math.ceil(textW + padX * 2);
  const height = Math.ceil(fontSize + padY * 2);
  const rx = 3;
  const textY = height - padY - 1;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">` +
    `<rect x="0" y="0" width="${width}" height="${height}" rx="${rx}" ry="${rx}" fill="${bg}"/>` +
    `<text x="${padX}" y="${textY}" fill="${fg}" font-size="${fontSize}" ` +
    `font-family="system-ui,-apple-system,sans-serif" font-weight="600">${escapeXml(tag.name)}</text>` +
    `</svg>`
  );
}

export function tagPillIconUri(tag: ConnectionTag): vscode.Uri {
  const svg = tagPillSvg(tag);
  return vscode.Uri.parse(
    `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`
  );
}

export function formatTagsPillsSvgUri(tags: ConnectionTag[]): vscode.Uri | undefined {
  const normalized = normalizeTags(tags);
  if (normalized.length === 0) {
    return undefined;
  }
  const fontSize = 10;
  const gap = 3;
  const padY = 2;
  const padX = 5;
  const charW = fontSize * 0.58;
  const pillWidths = normalized.map((tag) => {
    const textW = Math.max(tag.name.length * charW, fontSize);
    return Math.ceil(textW + padX * 2);
  });
  const height = Math.ceil(fontSize + padY * 2);
  const width = pillWidths.reduce((sum, w) => sum + w, 0) + gap * (normalized.length - 1);
  let x = 0;
  const pills = normalized
    .map((tag, index) => {
      const bg = tagColorHex(tag.color);
      const fg = contrastingTextColor(bg);
      const w = pillWidths[index];
      const textY = height - padY - 1;
      const pill =
        `<rect x="${x}" y="0" width="${w}" height="${height}" rx="3" ry="3" fill="${bg}"/>` +
        `<text x="${x + padX}" y="${textY}" fill="${fg}" font-size="${fontSize}" ` +
        `font-family="system-ui,-apple-system,sans-serif" font-weight="600">${escapeXml(tag.name)}</text>`;
      x += w + gap;
      return pill;
    })
    .join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">${pills}</svg>`;
  return vscode.Uri.parse(
    `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`
  );
}

export function formatTagsTooltip(tags: ConnectionTag[] | undefined): vscode.MarkdownString | undefined {
  const normalized = normalizeTags(tags);
  if (normalized.length === 0) {
    return undefined;
  }
  const md = new vscode.MarkdownString(
    normalized.map((t) => formatTagPillHtml(t)).join("")
  );
  md.supportHtml = true;
  md.isTrusted = true;
  return md;
}

export function connectionIcon(): vscode.ThemeIcon {
  return new vscode.ThemeIcon("plug");
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
