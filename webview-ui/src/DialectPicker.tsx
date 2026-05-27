import { useEffect, useId, useRef, useState } from "react";
import { DIALECT_OPTIONS, type Dialect } from "./connectionFields";

interface DialectPickerProps {
  value: Dialect;
  icons: Partial<Record<Dialect, string>>;
  disabled?: boolean;
  onChange: (dialect: Dialect) => void;
}

export function DialectPicker({
  value,
  icons,
  disabled,
  onChange,
}: DialectPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected =
    DIALECT_OPTIONS.find((opt) => opt.value === value) ?? DIALECT_OPTIONS[0];

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const pick = (dialect: Dialect) => {
    onChange(dialect);
    setOpen(false);
  };

  const renderOptionContent = (dialect: Dialect, label: string) => (
    <>
      {icons[dialect] ? (
        <img className="dialect-icon" src={icons[dialect]} alt="" aria-hidden="true" />
      ) : (
        <span className="dialect-icon dialect-icon-fallback" aria-hidden="true" />
      )}
      <span className="dialect-label">{label}</span>
    </>
  );

  return (
    <div
      ref={rootRef}
      className={`dialect-picker${open ? " open" : ""}${disabled ? " disabled" : ""}`}
    >
      <button
        type="button"
        id="field-dialect"
        className="dialect-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setOpen((prev) => !prev);
          }
        }}
      >
        {renderOptionContent(selected.value as Dialect, selected.label)}
        {!disabled ? <span className="dialect-picker-chevron" aria-hidden="true" /> : null}
      </button>
      {open ? (
        <ul id={listId} className="dialect-picker-menu" role="listbox">
          {DIALECT_OPTIONS.map((opt) => {
            const dialect = opt.value as Dialect;
            const isSelected = dialect === value;
            return (
              <li key={opt.value} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  className={`dialect-picker-option${isSelected ? " selected" : ""}`}
                  onClick={() => pick(dialect)}
                >
                  {renderOptionContent(dialect, opt.label)}
                  {isSelected ? (
                    <span className="dialect-picker-check" aria-hidden="true">
                      ✓
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
