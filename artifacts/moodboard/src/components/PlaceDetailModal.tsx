import { useState, useRef, useEffect } from "react";
import type { MoodboardItem, PlaceMeta } from "@/types";
import { buildMapsUrl } from "@/lib/gridUtils";
import { Lightbox } from "@/components/Lightbox";

interface PlaceDetailModalProps {
  item: MoodboardItem;
  onClose: () => void;
}

function MapPinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6M10 14L21 3" />
    </svg>
  );
}

export function PlaceDetailModal({ item, onClose }: PlaceDetailModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [gallery, setGallery] = useState<{ images: string[]; index: number } | null>(
    null,
  );

  const meta: PlaceMeta = (() => {
    try { return item.meta ? (JSON.parse(item.meta) as PlaceMeta) : {}; }
    catch { return {}; }
  })();

  const photos = meta.photos ?? [];
  const menuImages = meta.menuImages ?? [];
  const cuisines = meta.cuisines ?? [];
  const mapsUrl = meta.mapsUrl ?? buildMapsUrl(meta, item.title);
  const addressLine = [meta.address, meta.locality]
    .filter(Boolean)
    .join(", ");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The lightbox sits on top and handles its own Escape.
      if (e.key === "Escape" && !gallery) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, gallery]);

  return (
    <>
      <div
        className="modal-overlay"
        ref={overlayRef}
        onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      >
        <div className="modal-drawer place-detail">
          <div className="modal-handle" />

          <header className="place-detail-header">
            <h2 className="place-detail-title">{item.title}</h2>
            {cuisines.length > 0 && (
              <p className="place-detail-cuisines">{cuisines.join(" · ")}</p>
            )}
            <div className="place-detail-stats">
              {meta.rating != null && (
                <span className="place-rating-pill tnum">
                  {meta.rating.toFixed(1)} ★
                  {meta.ratingCount != null && (
                    <span className="place-rating-count">
                      {" "}
                      ({meta.ratingCount.toLocaleString()})
                    </span>
                  )}
                </span>
              )}
              {meta.priceForTwo && (
                <span className="discover-price-pill">{meta.priceForTwo}</span>
              )}
              {meta.hours && <span className="place-hours-pill">{meta.hours}</span>}
            </div>
          </header>

          {/* Location — the whole block hands off to the Google Maps app */}
          <section className="place-detail-section">
            <h3 className="place-detail-label">Location</h3>
            {mapsUrl ? (
              <a
                className="place-map-link"
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="place-map-link-icon"><MapPinIcon /></span>
                <span className="place-map-link-text">
                  <strong>Open in Google Maps</strong>
                  {addressLine && <span>{addressLine}</span>}
                </span>
                <ExternalIcon />
              </a>
            ) : (
              <p className="place-detail-plain">
                {addressLine || "No address saved."}
              </p>
            )}
            {meta.phone && (
              <a className="place-phone-link" href={`tel:${meta.phone.split(",")[0].trim()}`}>
                {meta.phone}
              </a>
            )}
          </section>

          {/* Ambiance photos */}
          {photos.length > 0 && (
            <section className="place-detail-section">
              <h3 className="place-detail-label">
                Ambiance <span className="place-detail-count tnum">{photos.length}</span>
              </h3>
              <div className="place-photo-strip">
                {photos.map((src, i) => (
                  <button
                    key={src}
                    className="place-photo-thumb"
                    onClick={() => setGallery({ images: photos, index: i })}
                    aria-label={`View photo ${i + 1} of ${photos.length}`}
                  >
                    <img src={src} alt="" loading="lazy" draggable={false} />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Menu pages */}
          {menuImages.length > 0 && (
            <section className="place-detail-section">
              <h3 className="place-detail-label">
                Menu{" "}
                <span className="place-detail-count tnum">
                  {menuImages.length} {menuImages.length === 1 ? "page" : "pages"}
                </span>
              </h3>
              <div className="place-menu-grid">
                {menuImages.map((src, i) => (
                  <button
                    key={src}
                    className="place-menu-thumb"
                    onClick={() => setGallery({ images: menuImages, index: i })}
                    aria-label={`View menu page ${i + 1} of ${menuImages.length}`}
                  >
                    <img src={src} alt="" loading="lazy" draggable={false} />
                  </button>
                ))}
              </div>
            </section>
          )}

          {photos.length === 0 && menuImages.length === 0 && (
            <p className="place-detail-plain">
              No menu or photos saved for this place.
            </p>
          )}

          {item.note?.trim() && (
            <section className="place-detail-section">
              <h3 className="place-detail-label">Your note</h3>
              <p className="place-detail-note">{item.note}</p>
            </section>
          )}

          <div className="modal-actions">
            {item.url && meta.source !== "manual" && (
              <a
                className="modal-btn-secondary"
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on District
              </a>
            )}
            <button className="modal-btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>

      {gallery && (
        <Lightbox
          images={gallery.images}
          startIndex={gallery.index}
          onClose={() => setGallery(null)}
        />
      )}
    </>
  );
}
