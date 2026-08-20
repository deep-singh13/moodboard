import { useState } from "react";
import type { MoodboardItem } from "@/types";
import { decodeQuoteMeta, encodeQuoteMeta, DEFAULT_QUOTE_COLOR } from "@/lib/itemMeta";
import { isQuoteColor, type QuoteColor } from "@/lib/quoteColors";
import { ModalShell } from "@/components/ModalShell";
import { QuoteColorPicker } from "@/components/QuoteColorPicker";

interface EditQuoteModalProps {
  item: MoodboardItem;
  onClose: () => void;
  onSave: (updates: { title: string; subtitle: string | null; meta: string }) => void;
}

export function EditQuoteModal({ item, onClose, onSave }: EditQuoteModalProps) {
  // A stored colour that isn't in the palette any more falls back rather than
  // being cast into the union and rendered as a missing CSS class.
  const storedColor = decodeQuoteMeta(item).color;
  const initialColor: QuoteColor = isQuoteColor(storedColor)
    ? storedColor
    : (DEFAULT_QUOTE_COLOR as QuoteColor);

  const [text, setText] = useState(item.title ?? "");
  const [author, setAuthor] = useState(item.subtitle ?? "");
  const [color, setColor] = useState<QuoteColor>(initialColor);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSave({
      title: text.trim(),
      subtitle: author.trim() || null,
      // Merged into the stored meta, not written over it: editing the colour
      // must not drop other keys this modal doesn't know about.
      meta: encodeQuoteMeta({ color }, item.meta),
    });
    onClose();
  };

  return (
    <ModalShell onClose={onClose} label="Edit quote">
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
            <QuoteColorPicker value={color} onChange={setColor} />
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
    </ModalShell>
  );
}
