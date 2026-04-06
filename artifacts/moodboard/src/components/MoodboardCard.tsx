import { useState } from "react";
import type { MoodboardItem } from "@/types";

interface MoodboardCardProps {
  item: MoodboardItem;
  onRemove: (id: string) => void;
  onPhotoClick: (src: string) => void;
}

export function MoodboardCard({ item, onRemove, onPhotoClick }: MoodboardCardProps) {
  const [imgError, setImgError] = useState(false);

  const cardStyle: React.CSSProperties = {
    position: "absolute",
    left: item.gridX ?? 0,
    top: item.gridY ?? 0,
    width: item.size ?? 320,
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
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

  if (item.type === "photo") {
    return (
      <div
        className="moodboard-card moodboard-card--photo card-appear"
        style={cardStyle}
        onClick={handleClick}
      >
        <img
          src={item.imageUrl ?? item.url}
          alt={item.title ?? "Photo"}
          className="photo-img"
          draggable={false}
        />
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
      className="moodboard-card card-appear"
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
          {item.type === "youtube" && (
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
