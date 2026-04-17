import { useState, useRef, useEffect } from "react";
import type { MoodboardItem } from "@/types";

interface MoodboardCardProps {
  item: MoodboardItem;
  onRemove: (id: string) => void;
  onToggleComplete: (id: string) => void;
  onPhotoClick: (src: string) => void;
  isHighlighted?: boolean;
  onUpdateNote?: (id: string, note: string | null) => void;
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}

export function MoodboardCard({
  item,
  onRemove,
  onToggleComplete,
  onPhotoClick,
  isHighlighted,
  onUpdateNote,
}: MoodboardCardProps) {
  const [imgError, setImgError] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [draftNote, setDraftNote] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const completed = !!item.completed;
  const hasNote = !!(item.note && item.note.trim());

  useEffect(() => {
    if (isEditingNote && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length,
      );
    }
  }, [isEditingNote]);

  const openNoteEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDraftNote(item.note ?? "");
    setIsEditingNote(true);
  };

  const saveNote = () => {
    const trimmed = draftNote.trim() || null;
    onUpdateNote?.(item.id, trimmed);
    setIsEditingNote(false);
  };

  const cancelNoteEdit = () => {
    setIsEditingNote(false);
  };

  const handleNoteKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelNoteEdit();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      saveNote();
    }
  };

  // onMouseDown preventDefault on save button prevents textarea blur before click fires
  const handleNoteBlur = () => {
    setTimeout(() => setIsEditingNote(false), 150);
  };

  const cardStyle: React.CSSProperties = {
    position: "absolute",
    left: item.gridX ?? 0,
    top: item.gridY ?? 0,
    width: item.size ?? 320,
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isEditingNote) return;
    if (completed) return;
    if (item.type === "photo") {
      onPhotoClick(item.imageUrl ?? item.url);
    } else {
      window.open(item.url, "_blank", "noopener noreferrer");
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onRemove(item.id);
  };

  const handleToggleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onToggleComplete(item.id);
  };

  const completedClass = completed ? "is-completed" : "";
  const highlightedClass = isHighlighted ? "is-highlighted" : "";

  const noteEditArea = isEditingNote ? (
    <div className="note-edit-area" onClick={(e) => e.stopPropagation()}>
      <textarea
        ref={textareaRef}
        className="note-textarea"
        value={draftNote}
        onChange={(e) => setDraftNote(e.target.value.slice(0, 300))}
        onKeyDown={handleNoteKeyDown}
        onBlur={handleNoteBlur}
        placeholder="Add a personal note…"
        rows={3}
      />
      <div className="note-edit-footer">
        <span className="note-char-count">{draftNote.length}/300</span>
        <button
          className="note-save-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => saveNote()}
        >
          Save
        </button>
      </div>
    </div>
  ) : null;

  if (item.type === "photo") {
    return (
      <div
        className={`moodboard-card moodboard-card--photo card-appear ${completedClass} ${highlightedClass}`}
        style={cardStyle}
        onClick={handleClick}
      >
        <img
          src={item.imageUrl ?? item.url}
          alt={item.title ?? "Photo"}
          className="photo-img"
          draggable={false}
        />
        {completed && (
          <div className="completed-overlay">
            <span className="completed-label">
              <CheckIcon />
              Completed
            </span>
          </div>
        )}
        <button
          className={`card-check ${completed ? "card-check--done" : ""}`}
          onClick={handleToggleComplete}
          aria-label={completed ? "Mark incomplete" : "Mark complete"}
          title={completed ? "Mark incomplete" : "Mark as done"}
        >
          <CheckIcon />
        </button>
        <button className="card-remove" onClick={handleRemove} aria-label="Remove">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
        {hasNote && !isEditingNote && <span className="note-dot" />}
        <button className="card-note" onClick={openNoteEdit} aria-label="Edit note" title="Edit note">
          <PencilIcon />
        </button>
        {noteEditArea}
      </div>
    );
  }

  return (
    <div
      className={`moodboard-card card-appear ${completedClass} ${highlightedClass}`}
      style={cardStyle}
      onClick={handleClick}
    >
      {item.imageUrl && !imgError ? (
        <div className="card-image-wrap">
          <img
            src={item.imageUrl}
            alt={item.title ?? ""}
            className="card-image"
            onError={() => setImgError(true)}
            draggable={false}
          />
          {item.type === "youtube" && !completed && (
            <div className="play-btn-overlay">
              <div className="play-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card-image-placeholder" />
      )}
      <div className="card-body">
        {item.title && <p className="card-title">{item.title}</p>}
        {item.subtitle && <p className="card-subtitle">{item.subtitle}</p>}
      </div>

      {completed && (
        <div className="completed-overlay">
          <span className="completed-label">
            <CheckIcon />
            Completed
          </span>
        </div>
      )}

      <button
        className={`card-check ${completed ? "card-check--done" : ""}`}
        onClick={handleToggleComplete}
        aria-label={completed ? "Mark incomplete" : "Mark complete"}
        title={completed ? "Mark incomplete" : "Mark as done"}
      >
        <CheckIcon />
      </button>

      <button className="card-remove" onClick={handleRemove} aria-label="Remove">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>

      {hasNote && !isEditingNote && <span className="note-dot" />}
      <button className="card-note" onClick={openNoteEdit} aria-label="Edit note" title="Edit note">
        <PencilIcon />
      </button>

      {noteEditArea}
    </div>
  );
}

export function SkeletonCard({ size }: { size: number }) {
  return (
    <div
      className="moodboard-card skeleton-card"
      style={{ width: size, position: "relative" }}
    >
      <div className="skeleton-image" />
      <div className="card-body">
        <div className="skeleton-line skeleton-title" />
        <div className="skeleton-line skeleton-subtitle" />
      </div>
    </div>
  );
}
