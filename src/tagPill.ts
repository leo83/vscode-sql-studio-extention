import type { ConnectionTag } from "./connectionTags";
import { contrastingTextColor, tagColorHex } from "./connectionTags";

export const TAG_PILL_HEIGHT = 14;
export const TAG_PILL_FONT_SIZE = 10;
export const TAG_PILL_RADIUS = 4;
export const TAG_PILL_PADDING_X = 6;
export const TAG_PILL_GAP = 4;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Approximate text width for pill layout (system-ui, 10px). */
export function measureTagPillTextWidth(text: string, fontSize = TAG_PILL_FONT_SIZE): number {
  return Math.ceil(text.length * fontSize * 0.55);
}

export function measureTagPillWidth(tag: ConnectionTag, fontSize = TAG_PILL_FONT_SIZE): number {
  return TAG_PILL_PADDING_X * 2 + measureTagPillTextWidth(tag.name, fontSize);
}

export function measureTagsRowWidth(tags: ConnectionTag[], fontSize = TAG_PILL_FONT_SIZE): number {
  if (tags.length === 0) {
    return 0;
  }
  const pills = tags.reduce((sum, tag) => sum + measureTagPillWidth(tag, fontSize), 0);
  return pills + TAG_PILL_GAP * (tags.length - 1);
}

export interface TagPillSvgOptions {
  x?: number;
  y?: number;
  fontSize?: number;
  height?: number;
}

/** Rounded rectangle pill with fill color and contrasting label text. */
export function tagPillSvg(tag: ConnectionTag, options: TagPillSvgOptions = {}): string {
  const x = options.x ?? 0;
  const y = options.y ?? 0;
  const fontSize = options.fontSize ?? TAG_PILL_FONT_SIZE;
  const height = options.height ?? TAG_PILL_HEIGHT;
  const width = measureTagPillWidth(tag, fontSize);
  const fill = tagColorHex(tag.color);
  const textColor = contrastingTextColor(fill);
  const textY = y + height / 2 + fontSize * 0.35;
  const textX = x + TAG_PILL_PADDING_X;

  return (
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${TAG_PILL_RADIUS}" ` +
    `ry="${TAG_PILL_RADIUS}" fill="${fill}"/>` +
    `<text x="${textX}" y="${textY}" fill="${textColor}" font-size="${fontSize}" ` +
    `font-family="system-ui,-apple-system,sans-serif" font-weight="500">` +
    `${escapeXml(tag.name)}</text>`
  );
}

/** Horizontal row of tag pills. */
export function tagsRowSvg(tags: ConnectionTag[], options: TagPillSvgOptions = {}): string {
  const fontSize = options.fontSize ?? TAG_PILL_FONT_SIZE;
  const height = options.height ?? TAG_PILL_HEIGHT;
  const width = measureTagsRowWidth(tags, fontSize);
  if (width === 0) {
    return "";
  }

  let cursor = 0;
  const pills = tags
    .map((tag) => {
      const fragment = tagPillSvg(tag, { x: cursor, y: 0, fontSize, height });
      cursor += measureTagPillWidth(tag, fontSize) + TAG_PILL_GAP;
      return fragment;
    })
    .join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">${pills}</svg>`
  );
}
