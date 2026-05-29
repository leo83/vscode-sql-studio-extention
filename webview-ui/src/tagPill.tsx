import type { ReactNode } from "react";
import { contrastingTextColor, tagColorHex, type ConnectionTag } from "./tagColors";

interface TagPillProps {
  tag: ConnectionTag;
  className?: string;
  onClick?: () => void;
  children?: ReactNode;
}

export function TagPill({ tag, className = "", onClick, children }: TagPillProps) {
  const background = tagColorHex(tag.color);
  const color = contrastingTextColor(background);
  const classes = ["tag-pill", className].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      className={classes}
      style={{ backgroundColor: background, color }}
      onClick={onClick}
    >
      <span className="tag-pill-label">{tag.name}</span>
      {children}
    </button>
  );
}
