import { useState } from "react";
import type { MoodboardItem } from "@/types";
import { CheckIcon, RemoveIcon } from "@/components/icons";
import { CardNoteEditor } from "@/components/CardNoteEditor";

interface MoodboardCardProps {
  item: MoodboardItem;
  onRemove: (id: string) => void;
  onToggleComplete: (id: string) => void;
  onPhotoClick: (src: string) => void;
  isHighlighted?: boolean;
  onUpdateNote?: (id: string, note: string | null) => void;
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
  const completed = !!item.completed;

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

  const noteEditor = (
    <CardNoteEditor
      note={item.note}
      isEditing={isEditingNote}
      onEditingChange={setIsEditingNote}
      onSave={(note) => onUpdateNote?.(item.id, note)}
    />
  );

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
              <CheckIcon size={13} />
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
          <CheckIcon size={13} />
        </button>
        <button className="card-remove" onClick={handleRemove} aria-label="Remove">
          <RemoveIcon />
        </button>
        {noteEditor}
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
        {item.type !== "link" && (
          <span className="card-type-badge" data-type={item.type}>
            {item.type === "youtube" && (
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            )}
            {item.type === "youtube" ? "YouTube" : "Substack"}
          </span>
        )}
      </div>

      {completed && (
        <div className="completed-overlay">
          <span className="completed-label">
            <CheckIcon size={13} />
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
        <CheckIcon size={13} />
      </button>

      <button className="card-remove" onClick={handleRemove} aria-label="Remove">
        <RemoveIcon />
      </button>

      {noteEditor}
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
