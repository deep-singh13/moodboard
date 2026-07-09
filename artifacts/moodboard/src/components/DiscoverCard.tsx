import { useState, useRef, useEffect } from "react";
import type { MoodboardItem } from "@/types";

interface DiscoverCardProps {
  item: MoodboardItem;
  onRemove: (id: string) => void;
  onToggleComplete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onUpdateNote?: (id: string, note: string | null) => void;
  onEdit?: (id: string) => void;
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

export function DiscoverCard({ item, onRemove, onToggleComplete, onTogglePin, onUpdateNote, onEdit, isHighlighted }: DiscoverCardProps) {
  const [imgError, setImgError] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [draftNote, setDraftNote] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const completed = !!item.completed;
  const pinned = !!item.pinned;
  const hasNote = !!(item.note?.trim());

  // Parse meta JSON safely
  const meta: Record<string, string> = (() => {
    try { return item.meta ? JSON.parse(item.meta) : {}; }
    catch { return {}; }
  })();

  useEffect(() => {
    if (isEditingNote && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [isEditingNote]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isEditingNote || completed) return;
    if (item.type === "movie" && meta.imdbId) {
      window.open(`https://www.imdb.com/title/${meta.imdbId}`, "_blank", "noopener noreferrer");
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

  const openNoteEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
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
        <span className={`discover-type-badge discover-type-badge--${item.type}`}>
          {getTypeIcon(item.type)} {getTypeBadgeLabel(item.type)}
        </span>
      </div>

      {/* Edit button top-left */}
      <button className="discover-edit-btn" onClick={handleEdit} aria-label="Edit item">
        <EditIcon />
      </button>

      {/* Remove button top-right */}
      <button className="card-remove" onClick={handleRemove} aria-label="Remove">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
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

      {/* Note dot + pencil button bottom-left */}
      {hasNote && !isEditingNote && <span className="note-dot" />}
      <button className="card-note" onClick={openNoteEdit} aria-label="Edit note">
        <PencilIcon />
      </button>

      {/* Inline note editor */}
      {isEditingNote && (
        <div className="note-edit-area" onClick={(e) => e.stopPropagation()}>
          <textarea
            ref={textareaRef}
            className="note-textarea"
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value.slice(0, 300))}
            onKeyDown={handleNoteKeyDown}
            onBlur={() => setTimeout(() => setIsEditingNote(false), 150)}
            placeholder="Add a personal note…"
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
