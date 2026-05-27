import { useMemo, useState } from "react";
import {
  TAG_COLOR_OPTIONS,
  normalizeTags,
  paletteColorFromHex,
  tagColorHex,
  tagColorLabel,
  type ConnectionTag,
} from "./tagColors";

interface Props {
  tags: ConnectionTag[];
  onChange: (tags: ConnectionTag[]) => void;
}

export function TagEditor({ tags, onChange }: Props) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(TAG_COLOR_OPTIONS[0].id);
  const [error, setError] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const normalized = normalizeTags(tags);
  const selectedHex = useMemo(() => tagColorHex(color), [color]);

  const applyColor = (nextColor: string) => {
    setColor(nextColor);
    if (editingIndex !== null) {
      const next = normalized.map((tag, index) =>
        index === editingIndex ? { ...tag, color: nextColor } : tag
      );
      onChange(next);
    }
  };

  const addTag = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Tag name is required");
      return;
    }
    if (normalized.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) {
      setError("Tag already exists");
      return;
    }
    onChange([...normalized, { name: trimmed, color }]);
    setName("");
    setError(null);
    setEditingIndex(null);
  };

  const removeTag = (index: number, event: React.MouseEvent) => {
    event.stopPropagation();
    onChange(normalized.filter((_, i) => i !== index));
    if (editingIndex === index) {
      setEditingIndex(null);
    }
  };

  const startEditColor = (index: number) => {
    setEditingIndex(index);
    setColor(normalized[index].color);
    setError(null);
  };

  const handleCustomColor = (hex: string) => {
    const paletteMatch = paletteColorFromHex(hex);
    applyColor(paletteMatch ?? hex.toUpperCase());
  };

  return (
    <div className="tag-editor">
      <div className="form-row">
        <label htmlFor="field-tags">Tags (optional)</label>
        <span className="field-hint">Colored [tags] shown in Database Explorer</span>
      </div>

      {normalized.length > 0 ? (
        <ul className="tag-list">
          {normalized.map((tag, index) => {
            const color = tagColorHex(tag.color);
            return (
              <li key={`${tag.name}-${index}`}>
                <button
                  type="button"
                  className={`tag-bracket${editingIndex === index ? " tag-bracket-editing" : ""}`}
                  style={{ color }}
                  aria-label={`Change color for ${tag.name}`}
                  onClick={() => startEditColor(index)}
                >
                  <span className="tag-name">[{tag.name}]</span>
                  <span
                    className="tag-remove"
                    role="button"
                    aria-label={`Remove tag ${tag.name}`}
                    onClick={(event) => removeTag(index, event)}
                  >
                    ×
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="tag-color-section">
        <div className="tag-color-header">
          <span className="tag-color-label">
            {editingIndex !== null
              ? `Color for “${normalized[editingIndex]?.name}”`
              : "Tag color"}
          </span>
          <span
            className="tag-color-preview-bracket"
            style={{ color: selectedHex }}
          >
            [{editingIndex !== null ? normalized[editingIndex]?.name : tagColorLabel(color)}]
          </span>
        </div>

        <div className="tag-color-picker" role="listbox" aria-label="Tag color palette">
          {TAG_COLOR_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`tag-color-option${color === opt.id ? " selected" : ""}`}
              style={{ backgroundColor: opt.hex }}
              title={opt.label}
              aria-label={opt.label}
              aria-selected={color === opt.id}
              onClick={() => applyColor(opt.id)}
            />
          ))}
        </div>

        <label className="tag-custom-color">
          <span>Custom color</span>
          <input
            type="color"
            value={selectedHex}
            aria-label="Pick a custom tag color"
            onChange={(e) => handleCustomColor(e.target.value)}
          />
          <code>{selectedHex}</code>
        </label>
      </div>

      <div className="tag-add-row">
        <input
          id="field-tags"
          type="text"
          placeholder="Tag name, e.g. prod"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
        />
        <button type="button" className="secondary tag-add-btn" onClick={addTag}>
          Add tag
        </button>
      </div>
      {error ? <span className="field-error">{error}</span> : null}
    </div>
  );
}
