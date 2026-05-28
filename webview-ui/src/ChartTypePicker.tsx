import { useEffect, useId, useRef, useState } from "react";
import { CHART_TYPE_OPTIONS, type ChartType } from "./chartConfig";

interface ChartTypePickerProps {
  value: ChartType;
  onChange: (chartType: ChartType) => void;
}

function ChartTypeIcon({ type }: { type: ChartType }) {
  const common = {
    width: 20,
    height: 16,
    viewBox: "0 0 20 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.2,
    "aria-hidden": true as const,
  };

  switch (type) {
    case "line":
      return (
        <svg {...common}>
          <polyline
            points="1,13 5,9 9,10 13,5 19,7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "bar":
      return (
        <svg {...common} stroke="none" fill="currentColor">
          <rect x="2" y="9" width="3" height="6" rx="0.5" opacity="0.55" />
          <rect x="7" y="5" width="3" height="10" rx="0.5" opacity="0.8" />
          <rect x="12" y="7" width="3" height="8" rx="0.5" />
          <rect x="17" y="3" width="3" height="12" rx="0.5" opacity="0.7" />
        </svg>
      );
    case "scatter":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <circle cx="4" cy="11" r="1.6" opacity="0.65" />
          <circle cx="8" cy="6" r="1.6" />
          <circle cx="12" cy="9" r="1.6" opacity="0.85" />
          <circle cx="16" cy="4" r="1.6" opacity="0.75" />
          <circle cx="6" cy="3" r="1.4" opacity="0.5" />
        </svg>
      );
    case "area":
      return (
        <svg {...common}>
          <path
            d="M1 13 L5 9 L9 10 L13 5 L19 7 L19 14 L1 14 Z"
            fill="currentColor"
            fillOpacity="0.25"
            stroke="none"
          />
          <polyline
            points="1,13 5,9 9,10 13,5 19,7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "pie":
      return (
        <svg {...common} stroke="none" fill="currentColor">
          <circle cx="10" cy="8" r="6.5" opacity="0.35" />
          <path d="M10 8 L10 1.5 A6.5 6.5 0 0 1 16.2 11 Z" />
        </svg>
      );
    case "heatmap":
      return (
        <svg {...common} stroke="none" fill="currentColor">
          <rect x="2" y="2" width="4.5" height="3.5" rx="0.5" opacity="0.35" />
          <rect x="7.75" y="2" width="4.5" height="3.5" rx="0.5" opacity="0.75" />
          <rect x="13.5" y="2" width="4.5" height="3.5" rx="0.5" opacity="0.55" />
          <rect x="2" y="6.25" width="4.5" height="3.5" rx="0.5" opacity="0.85" />
          <rect x="7.75" y="6.25" width="4.5" height="3.5" rx="0.5" opacity="0.45" />
          <rect x="13.5" y="6.25" width="4.5" height="3.5" rx="0.5" />
          <rect x="2" y="10.5" width="4.5" height="3.5" rx="0.5" opacity="0.6" />
          <rect x="7.75" y="10.5" width="4.5" height="3.5" rx="0.5" opacity="0.95" />
          <rect x="13.5" y="10.5" width="4.5" height="3.5" rx="0.5" opacity="0.5" />
        </svg>
      );
    default:
      return null;
  }
}

export function ChartTypePicker({ value, onChange }: ChartTypePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const suppressToggleRef = useRef(false);
  const listId = useId();
  const selected =
    CHART_TYPE_OPTIONS.find((opt) => opt.value === value) ?? CHART_TYPE_OPTIONS[0];

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

  const pick = (chartType: ChartType) => {
    suppressToggleRef.current = true;
    onChange(chartType);
    setOpen(false);
  };

  const toggleOpen = () => {
    if (suppressToggleRef.current) {
      suppressToggleRef.current = false;
      return;
    }
    setOpen((prev) => !prev);
  };

  const renderOptionContent = (chartType: ChartType, label: string) => (
    <>
      <span className="chart-type-icon">
        <ChartTypeIcon type={chartType} />
      </span>
      <span className="chart-type-label">{label}</span>
    </>
  );

  return (
    <div ref={rootRef} className={`chart-type-picker${open ? " open" : ""}`}>
      <button
        type="button"
        className="chart-type-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={toggleOpen}
      >
        {renderOptionContent(selected.value, selected.label)}
        <span className="chart-type-picker-chevron" aria-hidden="true" />
      </button>
      {open ? (
        <ul id={listId} className="chart-type-picker-menu" role="listbox">
          {CHART_TYPE_OPTIONS.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <li key={opt.value} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  className={`chart-type-picker-option${isSelected ? " selected" : ""}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pick(opt.value);
                  }}
                >
                  {renderOptionContent(opt.value, opt.label)}
                  {isSelected ? (
                    <span className="chart-type-picker-check" aria-hidden="true">
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
