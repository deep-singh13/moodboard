import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MoodboardItem } from "@/types";
import { decodeQuoteMeta } from "@/lib/itemMeta";
import { EditIcon, PinIcon, RemoveIcon } from "@/components/icons";
import { QuoteReadMoreModal } from "./QuoteReadMoreModal";

interface QuoteCardProps {
  item: MoodboardItem;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
  onTogglePin: (id: string) => void;
  isHighlighted?: boolean;
}

export function QuoteCard({ item, onRemove, onEdit, onTogglePin, isHighlighted }: QuoteCardProps) {
  const { color } = decodeQuoteMeta(item);
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
        <RemoveIcon />
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
