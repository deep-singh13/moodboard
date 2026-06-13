import { useEffect, useMemo, useRef, useState } from "react";
import type { MoodboardItem } from "@/types";

interface SpotlightSearchProps {
  open: boolean;
  onClose: () => void;
  items: MoodboardItem[];
  onSelect: (item: MoodboardItem) => void;
  placeholder?: string;
}

function matchesSearch(item: MoodboardItem, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  return [item.title ?? "", item.subtitle ?? "", item.note ?? ""].some((f) =>
    f.toLowerCase().includes(q),
  );
}

const TYPE_BADGE: Record<MoodboardItem["type"], string> = {
  substack: "Substack",
  youtube: "YouTube",
  link: "Link",
  photo: "Photo",
  movie: "Movie",
  reel: "Reel",
  quote: "Quote",
};

const COLS = 3;

export function SpotlightSearch({
  open,
  onClose,
  items,
  onSelect,
  placeholder = "Search… ",
}: SpotlightSearchProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () => items.filter((item) => matchesSearch(item, query)),
    [items, query],
  );

  // Reset query + selection and focus the input each time the modal opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // focus after paint so the element exists
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Keep the active index in range as results shrink.
  useEffect(() => {
    setActive((i) => (i >= results.length ? 0 : i));
  }, [results.length]);

  if (!open) return null;

  const commit = (item: MoodboardItem | undefined) => {
    if (item) onSelect(item);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + COLS, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - COLS, 0));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(results[active]);
    }
  };

  return (
    <div className="spotlight-backdrop" onMouseDown={onClose}>
      <div
        className="spotlight-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="spotlight-input-row">
          <svg
            className="spotlight-input-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            className="spotlight-input"
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search"
          />
        </div>

        {results.length === 0 ? (
          <div className="spotlight-empty">No results for &ldquo;{query}&rdquo;</div>
        ) : (
          <div className="spotlight-grid">
            {results.map((item, i) => (
              <button
                key={item.id}
                className={`spotlight-tile${i === active ? " active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(item)}
              >
                {item.imageUrl ? (
                  <span className="spotlight-tile-thumb">
                    <img src={item.imageUrl} alt="" loading="lazy" />
                  </span>
                ) : (
                  <span className="spotlight-tile-thumb spotlight-tile-thumb--text">
                    {item.title ?? item.subtitle ?? "Untitled"}
                  </span>
                )}
                <span className="spotlight-tile-meta">
                  <span className="spotlight-tile-title">
                    {item.title ?? item.subtitle ?? "Untitled"}
                  </span>
                  <span className="spotlight-tile-badge">{TYPE_BADGE[item.type]}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
