import { useState, useRef, useEffect } from "react";
import type { MoodboardItem } from "@/types";

const QUOTE_COLORS = ["sage", "blush", "lavender", "peach", "sky", "slate"] as const;
type QuoteColor = typeof QUOTE_COLORS[number];

interface AddQuoteModalProps {
  onClose: () => void;
  onAdd: (item: MoodboardItem) => void;
}

export function AddQuoteModal({ onClose, onAdd }: AddQuoteModalProps) {
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  const [color, setColor] = useState<QuoteColor>("sage");
  const overlayRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const item: MoodboardItem = {
      id: crypto.randomUUID(),
      type: "quote",
      url: "quote://local",
      title: text.trim(),
      subtitle: author.trim() || undefined,
      meta: JSON.stringify({ color }),
      board: "quotes",
      addedAt: new Date().toISOString(),
    };
    onAdd(item);
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
        <p className="modal-label">Add a quote</p>

        <form onSubmit={handleSubmit}>
          <div className="modal-field">
            <textarea
              ref={textareaRef}
              className="modal-textarea"
              rows={4}
              placeholder="Type or paste a quote…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          <div className="modal-field">
            <p className="modal-label">Author (optional)</p>
            <input
              type="text"
              className="modal-input"
              placeholder="e.g. Marcus Aurelius"
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
                  {c.charAt(0).toUpperCase() + c.slice(1)}
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
              Save quote
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
