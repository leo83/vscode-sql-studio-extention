export interface ConnectionTag {
  name: string;
  /** Palette id (e.g. "blue") or custom hex (#RRGGBB). */
  color: string;
}

export interface TagColorOption {
  id: string;
  label: string;
  hex: string;
}

export const TAG_COLOR_OPTIONS: TagColorOption[] = [
  { id: "blue", label: "Blue", hex: "#4FC3F7" },
  { id: "green", label: "Green", hex: "#81C784" },
  { id: "orange", label: "Orange", hex: "#FFB74D" },
  { id: "red", label: "Red", hex: "#E57373" },
  { id: "purple", label: "Purple", hex: "#BA68C8" },
  { id: "teal", label: "Teal", hex: "#4DB6AC" },
  { id: "yellow", label: "Yellow", hex: "#FFF176" },
  { id: "pink", label: "Pink", hex: "#F06292" },
  { id: "indigo", label: "Indigo", hex: "#7986CB" },
  { id: "lime", label: "Lime", hex: "#AED581" },
  { id: "brown", label: "Brown", hex: "#A1887F" },
  { id: "gray", label: "Gray", hex: "#90A4AE" },
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

export function tagColorLabel(color: string): string {
  if (isCustomTagColor(color)) {
    return color.toUpperCase();
  }
  return COLOR_BY_ID.get(color)?.label ?? TAG_COLOR_OPTIONS[0].label;
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

export function paletteColorFromHex(hex: string): string | undefined {
  const normalized = tagColorHex(hex).toUpperCase();
  return TAG_COLOR_OPTIONS.find((c) => c.hex.toUpperCase() === normalized)?.id;
}
