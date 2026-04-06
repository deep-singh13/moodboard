import { useState } from "react";
import type { MoodboardItem } from "@/types";

interface MoodboardCardProps {
  item: MoodboardItem;
  onRemove: (id: string) => void;
  onToggleComplete: (id: string) => void;
  onPhotoClick: (src: string) => void;
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

export function MoodboardCard({ item, onRemove, onToggleComplete, onPhotoClick }: MoodboardCardProps) {
  const [imgError, setImgError] = useState(false);
  const completed = !!item.completed;

  const cardStyle: React.CSSProperties = {
    position: "absolute",
    left: item.gridX ?? 0,
    top: item.gridY ?? 0,
    width: item.size ?? 320,
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (completed) return; // don't open completed items accidentally
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

  if (item.type === "photo") {
    return (
      <div
        className={`moodboard-card moodboard-card--photo card-appear ${completedClass}`}
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
      </div>
    );
  }

  return (
    <div
      className={`moodboard-card card-appear ${completedClass}`}
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

      {/* Completed hover overlay — shows when card is completed and hovered */}
      {completed && (
        <div className="completed-overlay">
          <span className="completed-label">
            <CheckIcon />
            Completed
          </span>
        </div>
      )}

      {/* Complete toggle — always visible */}
      <button
        className={`card-check ${completed ? "card-check--done" : ""}`}
        onClick={handleToggleComplete}
        aria-label={completed ? "Mark incomplete" : "Mark complete"}
        title={completed ? "Mark incomplete" : "Mark as done"}
      >
        <CheckIcon />
      </button>

      {/* Remove — shows on hover */}
      <button className="card-remove" onClick={handleRemove} aria-label="Remove">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
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
