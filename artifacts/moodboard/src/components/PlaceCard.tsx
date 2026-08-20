import { useState } from "react";
import type { MoodboardItem } from "@/types";
import { buildMapsUrl } from "@/lib/gridUtils";
import { decodePlaceMeta } from "@/lib/itemMeta";
import { CheckIcon, MapPinIcon, PinIcon, RemoveIcon } from "@/components/icons";
import { CardNoteEditor } from "@/components/CardNoteEditor";

interface PlaceCardProps {
  item: MoodboardItem;
  onOpen: (item: MoodboardItem) => void;
  onRemove: (id: string) => void;
  onToggleComplete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onUpdateNote?: (id: string, note: string | null) => void;
  isHighlighted?: boolean;
}

export function PlaceCard({
  item,
  onOpen,
  onRemove,
  onToggleComplete,
  onTogglePin,
  onUpdateNote,
  isHighlighted,
}: PlaceCardProps) {
  const [imgError, setImgError] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);

  const completed = !!item.completed;
  const pinned = !!item.pinned;

  const meta = decodePlaceMeta(item);

  const mapsUrl = meta.mapsUrl ?? buildMapsUrl(meta, item.title);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className={`discover-card place-card ${completed ? "is-completed" : ""}`}
      data-item-id={item.id}
      data-highlight={isHighlighted ? "true" : undefined}
      onClick={() => { if (!isEditingNote) onOpen(item); }}
    >
      {item.imageUrl && !imgError ? (
        <img
          src={item.imageUrl}
          alt={item.title ?? ""}
          className="discover-card-img discover-card-img--place"
          onError={() => setImgError(true)}
          draggable={false}
        />
      ) : (
        <div className="discover-card-placeholder discover-card-placeholder--place">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity={0.3}>
            <path d="M3 11h18M5 11V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4M4 11v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
          </svg>
        </div>
      )}

      <div className="discover-card-body">
        {item.title && <p className="discover-card-title">{item.title}</p>}
        {item.subtitle && <p className="discover-card-subtitle">{item.subtitle}</p>}

        <div className="discover-badge-row">
          {meta.rating != null && (
            <span className="place-rating-pill tnum">{meta.rating.toFixed(1)} ★</span>
          )}
          {meta.priceForTwo && (
            <span className="discover-price-pill">{meta.priceForTwo}</span>
          )}
          {mapsUrl && (
            <a
              className="place-map-pill"
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={stop}
              aria-label={`Open ${item.title ?? "this place"} in Google Maps`}
            >
              <MapPinIcon /> Maps
            </a>
          )}
        </div>
      </div>

      <button className="card-remove" onClick={(e) => { stop(e); onRemove(item.id); }} aria-label="Remove">
        <RemoveIcon />
      </button>

      <button
        className={`card-pin ${pinned ? "card-pin--active" : ""}`}
        onClick={(e) => { stop(e); onTogglePin(item.id); }}
        aria-label={pinned ? "Unpin place" : "Pin place"}
      >
        <PinIcon />
      </button>

      <button
        className={`card-check ${completed ? "card-check--done" : ""}`}
        onClick={(e) => { stop(e); onToggleComplete(item.id); }}
        aria-label={completed ? "Mark as not visited" : "Mark as visited"}
      >
        <CheckIcon />
      </button>

      <CardNoteEditor
        note={item.note}
        isEditing={isEditingNote}
        onEditingChange={setIsEditingNote}
        onSave={(note) => onUpdateNote?.(item.id, note)}
        placeholder="What to order, who to bring…"
      />
    </div>
  );
}
