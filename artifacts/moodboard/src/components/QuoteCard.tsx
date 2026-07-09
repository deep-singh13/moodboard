import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MoodboardItem } from "@/types";
import { QuoteReadMoreModal } from "./QuoteReadMoreModal";

interface QuoteCardProps {
  item: MoodboardItem;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
  onTogglePin: (id: string) => void;
  isHighlighted?: boolean;
}

function EditIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 17v5" />
      <path d="M9 10.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6.5l2 3.5H7l2-3.5z" />
    </svg>
  );
}

export function QuoteCard({ item, onRemove, onEdit, onTogglePin, isHighlighted }: QuoteCardProps) {
  const meta: Record<string, string> = (() => {
    try { return item.meta ? JSON.parse(item.meta) : {}; }
    catch { return {}; }
  })();

  const color = meta.color ?? "sage";
  const pinned = !!item.pinned;

  const [isOverflowing, setIsOverflowing] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;

    const checkOverflow = () => {
      setIsOverflowing(el.scrollHeight > el.clientHeight + 1);
    };

    checkOverflow();

    const observer = new ResizeObserver(checkOverflow);
    observer.observe(el);
    return () => observer.disconnect();
  }, [item.title]);

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(item.id);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(item.id);
  };

  const handlePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    onTogglePin(item.id);
  };

  const handleReadMore = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowFull(true);
  };

  return (
    <div
      className={`quote-card quote-card--${color}`}
      data-item-id={item.id}
      data-highlight={isHighlighted ? "true" : undefined}
    >
      <p ref={textRef} className="quote-card-text quote-card-text--clamped">{item.title}</p>
      {isOverflowing && (
        <button type="button" className="quote-read-more-btn" onClick={handleReadMore}>
          Read more
        </button>
      )}
      {item.subtitle && <p className="quote-card-author">{item.subtitle}</p>}

      <button className="discover-edit-btn" onClick={handleEdit} aria-label="Edit quote">
        <EditIcon />
      </button>

      <button
        className={`card-pin ${pinned ? "card-pin--active" : ""}`}
        onClick={handlePin}
        aria-label={pinned ? "Unpin quote" : "Pin quote"}
      >
        <PinIcon />
      </button>

      <button className="card-remove" onClick={handleRemove} aria-label="Remove quote">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      {showFull && createPortal(
        <QuoteReadMoreModal
          text={item.title ?? ""}
          author={item.subtitle}
          onClose={() => setShowFull(false)}
        />,
        document.body,
      )}
    </div>
  );
}
