import { useState, useRef, useEffect } from "react";
import type { MoodboardItem, PlaceMeta } from "@/types";
import { buildMapsUrl } from "@/lib/gridUtils";

interface PlaceCardProps {
  item: MoodboardItem;
  onOpen: (item: MoodboardItem) => void;
  onRemove: (id: string) => void;
  onToggleComplete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onUpdateNote?: (id: string, note: string | null) => void;
  isHighlighted?: boolean;
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
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

function MapPinIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
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
  const [draftNote, setDraftNote] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const completed = !!item.completed;
  const pinned = !!item.pinned;
  const hasNote = !!item.note?.trim();

  const meta: PlaceMeta = (() => {
    try { return item.meta ? (JSON.parse(item.meta) as PlaceMeta) : {}; }
    catch { return {}; }
  })();

  const mapsUrl = meta.mapsUrl ?? buildMapsUrl(meta, item.title);

  useEffect(() => {
    if (isEditingNote && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [isEditingNote]);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const openNoteEdit = (e: React.MouseEvent) => {
    stop(e);
    setDraftNote(item.note ?? "");
    setIsEditingNote(true);
  };

  const saveNote = () => {
    onUpdateNote?.(item.id, draftNote.trim() || null);
    setIsEditingNote(false);
  };

  const handleNoteKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); setIsEditingNote(false); }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveNote(); }
  };

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
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
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

      {hasNote && !isEditingNote && <span className="note-dot" />}
      <button className="card-note" onClick={openNoteEdit} aria-label="Edit note">
        <PencilIcon />
      </button>

      {isEditingNote && (
        <div className="note-edit-area" onClick={stop}>
          <textarea
            ref={textareaRef}
            className="note-textarea"
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value.slice(0, 300))}
            onKeyDown={handleNoteKeyDown}
            onBlur={() => setTimeout(() => setIsEditingNote(false), 150)}
            placeholder="What to order, who to bring…"
            rows={3}
          />
          <div className="note-edit-footer">
            <span className="note-char-count">{draftNote.length}/300</span>
            <button
              className="note-save-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={saveNote}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
