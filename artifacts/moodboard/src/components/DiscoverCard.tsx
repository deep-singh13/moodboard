import { useState } from "react";
import type { MoodboardItem } from "@/types";
import { decodeMovieMeta } from "@/lib/itemMeta";
import { CheckIcon, EditIcon, PinIcon, RemoveIcon } from "@/components/icons";
import { CardNoteEditor } from "@/components/CardNoteEditor";

interface DiscoverCardProps {
  item: MoodboardItem;
  onRemove: (id: string) => void;
  onToggleComplete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onUpdateNote?: (id: string, note: string | null) => void;
  onEdit?: (id: string) => void;
  onRefreshPrice?: (id: string) => void;
  isRefreshingPrice?: boolean;
  isHighlighted?: boolean;
}

function RefreshIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 4v6h-6" />
      <path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function formatPrice(price: number, currency?: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return `$${price.toFixed(2)}`;
  }
}

function getStatusLabel(type: string, completed: boolean): string {
  if (type === "movie") return completed ? "Watched ✓" : "Want to watch";
  if (type === "reel")  return completed ? "Seen ✓"    : "Saved";
  return completed ? "Visited ✓" : "Saved";
}

function getTypeBadgeLabel(type: string): string {
  if (type === "movie") return "Movie";
  if (type === "reel")  return "Reel";
  return "Link";
}

function getTypeIcon(type: string): React.ReactNode {
  if (type === "movie") {
    return (
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="2" width="20" height="20" rx="2" /><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 7h5M17 17h5" />
      </svg>
    );
  }
  if (type === "reel") {
    return (
      <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    );
  }
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

export function DiscoverCard({ item, onRemove, onToggleComplete, onTogglePin, onUpdateNote, onEdit, onRefreshPrice, isRefreshingPrice, isHighlighted }: DiscoverCardProps) {
  const [imgError, setImgError] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);

  const completed = !!item.completed;
  const pinned = !!item.pinned;

  const { imdbId } = decodeMovieMeta(item);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isEditingNote || completed) return;
    if (item.type === "movie" && imdbId) {
      window.open(`https://www.imdb.com/title/${imdbId}`, "_blank", "noopener noreferrer");
    } else {
      window.open(item.url, "_blank", "noopener noreferrer");
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(item.id);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleComplete(item.id);
  };

  const handlePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    onTogglePin(item.id);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.(item.id);
  };

  const handleRefreshPrice = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRefreshPrice?.(item.id);
  };

  const completedClass = completed ? "is-completed" : "";
  const typeClass = `discover-card-img--${item.type}`;
  const placeholderClass = `discover-card-placeholder--${item.type}`;

  const image = !item.imageUrl ? null : imgError ? (
    <div className={`discover-card-placeholder ${placeholderClass}`}>
      {item.type === "reel" && (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity={0.3}>
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      )}
      {item.type === "movie" && (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity={0.3}>
          <rect x="2" y="2" width="20" height="20" rx="2" /><path d="M7 2v20M17 2v20M2 12h20" />
        </svg>
      )}
      {item.type === "link" && (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity={0.3}>
          <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
        </svg>
      )}
    </div>
  ) : (
    <img
      src={item.imageUrl}
      alt={item.title ?? ""}
      className={`discover-card-img ${typeClass}`}
      onError={() => setImgError(true)}
      draggable={false}
    />
  );

  return (
    <div
      className={`discover-card ${completedClass}`}
      data-item-id={item.id}
      data-highlight={isHighlighted ? "true" : undefined}
      onClick={handleClick}
    >
      {image}

      <div className="discover-card-body">
        {item.title && <p className="discover-card-title">{item.title}</p>}
        {item.subtitle && <p className="discover-card-subtitle">{item.subtitle}</p>}
        <div className="discover-badge-row">
          <span className={`discover-type-badge discover-type-badge--${item.type}`}>
            {getTypeIcon(item.type)} {getTypeBadgeLabel(item.type)}
          </span>
          {item.type === "link" && (
            <>
              {item.price != null && (
                <span className="discover-price-pill">{formatPrice(item.price, item.currency)}</span>
              )}
              {item.availability && item.availability !== "unknown" && (
                <span
                  className={`discover-availability-pill discover-availability-pill--${item.availability}`}
                >
                  {item.availability === "in_stock" ? "In stock" : "Out of stock"}
                </span>
              )}
              <button
                type="button"
                className={`discover-refresh-btn ${isRefreshingPrice ? "is-refreshing" : ""}`}
                onClick={handleRefreshPrice}
                disabled={isRefreshingPrice}
                aria-label="Refresh price"
              >
                <RefreshIcon />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Edit button top-left */}
      <button className="discover-edit-btn" onClick={handleEdit} aria-label="Edit item">
        <EditIcon />
      </button>

      {/* Remove button top-right */}
      <button className="card-remove" onClick={handleRemove} aria-label="Remove">
        <RemoveIcon />
      </button>

      {/* Pin button top-right, left of remove */}
      <button
        className={`card-pin ${pinned ? "card-pin--active" : ""}`}
        onClick={handlePin}
        aria-label={pinned ? "Unpin item" : "Pin item"}
      >
        <PinIcon />
      </button>

      {/* Check button bottom-right */}
      <button
        className={`card-check ${completed ? "card-check--done" : ""}`}
        onClick={handleToggle}
        aria-label={completed ? "Mark incomplete" : "Mark complete"}
      >
        <CheckIcon />
      </button>

      {/* Note dot + pencil + inline editor, bottom-left */}
      <CardNoteEditor
        note={item.note}
        isEditing={isEditingNote}
        onEditingChange={setIsEditingNote}
        onSave={(note) => onUpdateNote?.(item.id, note)}
      />
    </div>
  );
}
