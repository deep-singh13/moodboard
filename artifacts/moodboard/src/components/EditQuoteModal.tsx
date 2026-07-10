import { useState, useRef } from "react";
import type { MoodboardItem } from "@/types";

const QUOTE_COLORS = [
  "bleached-apricot",
  "sea-salt",
  "deep-claret",
  "cowhide",
  "radiant-orchid",
  "banana-pudding",
  "chili-pepper",
  "guava-jam",
  "rosette",
  "honey",
] as const;
type QuoteColor = typeof QUOTE_COLORS[number];

const QUOTE_COLOR_LABELS: Record<QuoteColor, string> = {
  "bleached-apricot": "Bleached Apricot",
  "sea-salt": "Sea Salt",
  "deep-claret": "Deep Claret",
  cowhide: "Cowhide",
  "radiant-orchid": "Radiant Orchid",
  "banana-pudding": "Banana Pudding",
  "chili-pepper": "Chili Pepper",
  "guava-jam": "Guava Jam",
  rosette: "Rosette",
  honey: "Honey",
};

interface EditQuoteModalProps {
  item: MoodboardItem;
  onClose: () => void;
  onSave: (updates: { title: string; subtitle: string | null; meta: string }) => void;
}

export function EditQuoteModal({ item, onClose, onSave }: EditQuoteModalProps) {
  const initialMeta = (() => {
    try { return item.meta ? JSON.parse(item.meta) : {}; }
    catch { return {}; }
  })();

  const [text, setText] = useState(item.title ?? "");
  const [author, setAuthor] = useState(item.subtitle ?? "");
  const [color, setColor] = useState<QuoteColor>((initialMeta.color as QuoteColor) ?? "bleached-apricot");
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSave({
      title: text.trim(),
      subtitle: author.trim() || null,
      meta: JSON.stringify({ color }),
    });
    onClose();
  };

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="modal-drawer">
        <div className="modal-handle" />
        <p className="modal-label">Edit quote</p>

        <form onSubmit={handleSubmit}>
          <div className="modal-field">
            <textarea
              className="modal-textarea"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
          </div>

          <div className="modal-field">
            <p className="modal-label">Author (optional)</p>
            <input
              type="text"
              className="modal-input"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </div>

          <div className="modal-field">
            <p className="modal-label">Color</p>
            <div className="quote-color-pills">
              {QUOTE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`quote-color-pill quote-color-pill--${c}${color === c ? " selected" : ""}`}
                  onClick={() => setColor(c)}
                >
                  {QUOTE_COLOR_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="submit"
              className="modal-btn-primary"
              disabled={!text.trim()}
            >
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
