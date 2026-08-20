import { QUOTE_COLORS, QUOTE_COLOR_LABELS, type QuoteColor } from "@/lib/quoteColors";

interface QuoteColorPickerProps {
  value: QuoteColor;
  onChange: (color: QuoteColor) => void;
}

/** Just the pill row — callers keep their own label/field wrapper, matching
 *  how every other field in these forms is structured. */
export function QuoteColorPicker({ value, onChange }: QuoteColorPickerProps) {
  return (
    <div className="quote-color-pills">
      {QUOTE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={`quote-color-pill quote-color-pill--${c}${value === c ? " selected" : ""}`}
          onClick={() => onChange(c)}
        >
          {QUOTE_COLOR_LABELS[c]}
        </button>
      ))}
    </div>
  );
}
