import { useState, useRef, useEffect } from "react";
import type { MoodboardItem } from "@/types";
import { encodeQuoteMeta } from "@/lib/itemMeta";
import type { QuoteColor } from "@/lib/quoteColors";
import { ModalShell } from "@/components/ModalShell";
import { QuoteColorPicker } from "@/components/QuoteColorPicker";

interface AddQuoteModalProps {
  onClose: () => void;
  onAdd: (item: MoodboardItem) => void;
}

export function AddQuoteModal({ onClose, onAdd }: AddQuoteModalProps) {
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  const [color, setColor] = useState<QuoteColor>("bleached-apricot");
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
      meta: encodeQuoteMeta({ color }),
      board: "quotes",
      addedAt: new Date().toISOString(),
    };
    onAdd(item);
    onClose();
  };

  return (
    <ModalShell onClose={onClose} label="Add a quote">
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
            <QuoteColorPicker value={color} onChange={setColor} />
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
    </ModalShell>
  );
}
