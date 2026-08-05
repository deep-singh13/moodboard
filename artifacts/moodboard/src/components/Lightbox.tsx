import { useEffect, useState, useCallback } from "react";

interface LightboxProps {
  /** Single image. Ignored when `images` is provided. */
  src?: string;
  /** Gallery mode — arrows and ←/→ page through these. */
  images?: string[];
  startIndex?: number;
  onClose: () => void;
}

export function Lightbox({ src, images, startIndex = 0, onClose }: LightboxProps) {
  const gallery = images && images.length > 0 ? images : src ? [src] : [];
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(startIndex, 0), Math.max(gallery.length - 1, 0)),
  );

  const step = useCallback(
    (delta: number) => {
      setIndex((i) => (i + delta + gallery.length) % gallery.length);
    },
    [gallery.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (gallery.length < 2) return;
      if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, step, gallery.length]);

  if (gallery.length === 0) return null;

  const multiple = gallery.length > 1;

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>

      {multiple && (
        <button
          className="lightbox-nav lightbox-nav--prev"
          onClick={(e) => { e.stopPropagation(); step(-1); }}
          aria-label="Previous image"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}

      <img
        src={gallery[index]}
        alt={multiple ? `Image ${index + 1} of ${gallery.length}` : "Full size"}
        className="lightbox-img"
        onClick={e => e.stopPropagation()}
        draggable={false}
      />

      {multiple && (
        <>
          <button
            className="lightbox-nav lightbox-nav--next"
            onClick={(e) => { e.stopPropagation(); step(1); }}
            aria-label="Next image"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
          <span className="lightbox-counter tnum">
            {index + 1} / {gallery.length}
          </span>
        </>
      )}
    </div>
  );
}
