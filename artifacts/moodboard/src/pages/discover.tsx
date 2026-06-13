import { useState, useCallback, useEffect, useRef } from "react";
import type { MoodboardItem } from "@/types";
import { fetchItems, createItem, deleteItem, patchItemComplete, patchItemNote, patchItemEdit } from "@/lib/api";
import { DiscoverCard } from "@/components/DiscoverCard";
import { AddDiscoverModal } from "@/components/AddDiscoverModal";
import { EditDiscoverItemModal } from "@/components/EditDiscoverItemModal";
import { SpotlightSearch } from "@/components/SpotlightSearch";

type TypeFilter = "all" | "movie" | "reel" | "link";
type StatusFilter = "all" | "want" | "done";

function useColumnCount(): number {
  const [cols, setCols] = useState(() => {
    const w = typeof window !== "undefined" ? window.innerWidth : 1200;
    return w < 640 ? 2 : w < 1024 ? 3 : 4;
  });
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setCols(w < 640 ? 2 : w < 1024 ? 3 : 4);
    };
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return cols;
}

interface DiscoverProps {
  spotlightOpen: boolean;
  onSpotlightClose: () => void;
}


export default function Discover({ spotlightOpen, onSpotlightClose }: DiscoverProps) {
  const [items, setItems] = useState<MoodboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [addError, setAddError] = useState<string | null>(null);
  const [thumbToast, setThumbToast] = useState(false);
  const [editItem, setEditItem] = useState<MoodboardItem | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchItems("discover")
      .then((loaded) => { setItems(loaded); setLoading(false); })
      .catch(() => { setLoadError(true); setLoading(false); });
  }, []);

  const addItem = useCallback((item: MoodboardItem) => {
    setItems((prev) => [...prev, item]);
    // Show thumbnail toast for reels and links that came in without an image
    if (!item.imageUrl && (item.type === "reel" || item.type === "link")) {
      setThumbToast(true);
      setTimeout(() => setThumbToast(false), 5000);
    }
    createItem(item).catch(() => {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setAddError("Couldn't save — check your connection.");
      setTimeout(() => setAddError(null), 4000);
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    deleteItem(id).catch(() => {});
  }, []);

  const toggleComplete = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.map((i) =>
        i.id === id ? { ...i, completed: !i.completed } : i,
      );
      const updated = next.find((i) => i.id === id);
      if (updated) patchItemComplete(id, updated.completed ?? false).catch(() => {});
      return next;
    });
  }, []);

  const updateNote = useCallback((id: string, note: string | null) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, note: note ?? undefined } : i)),
    );
    patchItemNote(id, note).catch(() => {});
  }, []);

  const updateItem = useCallback(
    (id: string, updates: { title?: string | null; imageUrl?: string | null }) => {
      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== id) return i;
          return {
            ...i,
            ...(("title" in updates) && { title: updates.title ?? undefined }),
            ...(("imageUrl" in updates) && { imageUrl: updates.imageUrl ?? undefined }),
          };
        }),
      );
      patchItemEdit(id, updates).catch(() => {});
    },
    [],
  );

  const selectItem = useCallback((item: MoodboardItem) => {
    onSpotlightClose();
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    setHighlightId(item.id);
    requestAnimationFrame(() => {
      document
        .querySelector(`.discover-page [data-item-id="${item.id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    highlightTimer.current = setTimeout(() => setHighlightId(null), 1800);
  }, [onSpotlightClose]);

  useEffect(() => () => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
  }, []);

  const displayed = items.filter((item) => {
    if (typeFilter !== "all" && item.type !== typeFilter) return false;
    if (statusFilter === "want" && item.completed) return false;
    if (statusFilter === "done" && !item.completed) return false;
    return true;
  });

  const numCols = useColumnCount();
  const columns: MoodboardItem[][] = Array.from({ length: numCols }, () => []);
  displayed.forEach((item, i) => columns[i % numCols].push(item));

  const chipClass = (active: boolean) => `filter-chip${active ? " active" : ""}`;

  return (
    <div className="discover-page">
      <div className="discover-page-inner">
        <header className="discover-header">
          <span className="discover-eyebrow">A running collection</span>
          <h1 className="discover-title">Things worth coming back to</h1>
          <span className="discover-meta tnum">
            {items.length} saved
          </span>
        </header>

        {/* Filter chips — type group, divider, status group */}
        <div className="discover-filters" role="toolbar" aria-label="Filter saved items">
          <button className={chipClass(typeFilter === "all")}   onClick={() => setTypeFilter("all")}>All</button>
          <button className={chipClass(typeFilter === "movie")} onClick={() => setTypeFilter("movie")}>Movies</button>
          <button className={chipClass(typeFilter === "reel")}  onClick={() => setTypeFilter("reel")}>Reels</button>
          <button className={chipClass(typeFilter === "link")}  onClick={() => setTypeFilter("link")}>Links</button>
          <span className="filter-divider" aria-hidden="true" />
          <button className={chipClass(statusFilter === "want")} onClick={() => setStatusFilter(statusFilter === "want" ? "all" : "want")}>
            To watch
          </button>
          <button className={chipClass(statusFilter === "done")} onClick={() => setStatusFilter(statusFilter === "done" ? "all" : "done")}>
            Watched
          </button>
        </div>

        {/* States */}
        {loading && (
          <div className="discover-empty">
            <div className="canvas-loading" aria-label="Loading">
              <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
            </div>
          </div>
        )}

        {loadError && (
          <div className="discover-empty">
            <div className="discover-empty-inner">
              <span className="discover-empty-glyph" aria-hidden="true">…</span>
              <span className="empty-state-headline">Couldn&rsquo;t connect</span>
              <p>Check your connection and refresh the page.</p>
            </div>
          </div>
        )}

        {!loading && !loadError && items.length === 0 && (
          <div className="discover-empty">
            <div className="discover-empty-inner">
              <span className="discover-empty-glyph" aria-hidden="true">✦</span>
              <span className="empty-state-headline">Nothing saved yet</span>
              <p>Stash a film you keep meaning to watch, a reel you can&rsquo;t stop replaying, or a link worth a second read.</p>
            </div>
          </div>
        )}

        {!loading && !loadError && items.length > 0 && displayed.length === 0 && (
          <div className="discover-empty">
            <div className="discover-empty-inner">
              <p>No matches for these filters.</p>
            </div>
          </div>
        )}

        {!loading && !loadError && displayed.length > 0 && (
          <div className="discover-masonry">
            {columns.map((col, ci) => (
              <div key={ci} className="discover-col">
                {col.map((item) => (
                  <DiscoverCard
                    key={item.id}
                    item={item}
                    isHighlighted={item.id === highlightId}
                    onRemove={removeItem}
                    onToggleComplete={toggleComplete}
                    onUpdateNote={updateNote}
                    onEdit={(id) => {
                      const found = items.find((i) => i.id === id);
                      if (found) setEditItem(found);
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FAB */}
      <button className="fab-btn" onClick={() => setIsModalOpen(true)} aria-label="Add item">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span className="fab-label">Add</span>
      </button>

      {isModalOpen && (
        <AddDiscoverModal onClose={() => setIsModalOpen(false)} onAdd={addItem} />
      )}

      {editItem && (
        <EditDiscoverItemModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSave={(updates) => {
            updateItem(editItem.id, updates);
            setEditItem(null);
          }}
        />
      )}

      {addError && (
        <div className="error-toast" role="alert">{addError}</div>
      )}

      {thumbToast && (
        <div className="thumb-toast" role="status">
          Couldn&rsquo;t grab a thumbnail. Hover the card and tap <strong>✎</strong> to add one.
        </div>
      )}

      <SpotlightSearch
        open={spotlightOpen}
        onClose={onSpotlightClose}
        items={items}
        onSelect={selectItem}
        placeholder="Search saved items…"
      />
    </div>
  );
}
