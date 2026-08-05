import { useState, useCallback, useEffect, useRef } from "react";
import type { MoodboardItem } from "@/types";
import {
  fetchItems,
  createItem,
  deleteItem,
  patchItemComplete,
  patchItemPinned,
  patchItemNote,
} from "@/lib/api";
import { useColumnCount, sortItems, toColumns } from "@/lib/gridUtils";
import { PlaceCard } from "@/components/PlaceCard";
import { AddPlaceModal } from "@/components/AddPlaceModal";
import { PlaceDetailModal } from "@/components/PlaceDetailModal";
import { SpotlightSearch } from "@/components/SpotlightSearch";

type StatusFilter = "all" | "want" | "been";

interface PlacesProps {
  spotlightOpen: boolean;
  onSpotlightClose: () => void;
}

export default function Places({ spotlightOpen, onSpotlightClose }: PlacesProps) {
  const [items, setItems] = useState<MoodboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [addError, setAddError] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<MoodboardItem | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchItems("places")
      .then((loaded) => { setItems(loaded); setLoading(false); })
      .catch(() => { setLoadError(true); setLoading(false); });
  }, []);

  useEffect(() => () => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
  }, []);

  const addItem = useCallback((item: MoodboardItem) => {
    setItems((prev) => sortItems([item, ...prev]));
    createItem(item).catch(() => {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setAddError("Couldn't save — check your connection.");
      setTimeout(() => setAddError(null), 4000);
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setDetailItem((current) => (current?.id === id ? null : current));
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

  const togglePin = useCallback((id: string) => {
    setItems((prev) => {
      const next = sortItems(
        prev.map((i) => (i.id === id ? { ...i, pinned: !i.pinned } : i)),
      );
      const updated = next.find((i) => i.id === id);
      if (updated) patchItemPinned(id, updated.pinned ?? false).catch(() => {});
      return next;
    });
  }, []);

  const updateNote = useCallback((id: string, note: string | null) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, note: note ?? undefined } : i)),
    );
    patchItemNote(id, note).catch(() => {});
  }, []);

  const selectItem = useCallback((item: MoodboardItem) => {
    onSpotlightClose();
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    setHighlightId(item.id);
    requestAnimationFrame(() => {
      document
        .querySelector(`.places-page [data-item-id="${item.id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    highlightTimer.current = setTimeout(() => setHighlightId(null), 1800);
  }, [onSpotlightClose]);

  const displayed = items.filter((item) => {
    if (statusFilter === "want" && item.completed) return false;
    if (statusFilter === "been" && !item.completed) return false;
    return true;
  });

  const numCols = useColumnCount();
  const columns = toColumns(displayed, numCols);

  const chipClass = (active: boolean) => `filter-chip${active ? " active" : ""}`;

  return (
    <div className="places-page discover-page">
      <div className="discover-page-inner">
        <header className="discover-header">
          <span className="discover-eyebrow">Tables worth booking</span>
          <h1 className="discover-title">Places to eat</h1>
          <span className="discover-meta tnum">{items.length} saved</span>
        </header>

        <div className="discover-filters" role="toolbar" aria-label="Filter saved places">
          <button className={chipClass(statusFilter === "all")} onClick={() => setStatusFilter("all")}>
            All
          </button>
          <span className="filter-divider" aria-hidden="true" />
          <button
            className={chipClass(statusFilter === "want")}
            onClick={() => setStatusFilter(statusFilter === "want" ? "all" : "want")}
          >
            Want to go
          </button>
          <button
            className={chipClass(statusFilter === "been")}
            onClick={() => setStatusFilter(statusFilter === "been" ? "all" : "been")}
          >
            Been there
          </button>
        </div>

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
              <span className="discover-empty-glyph" aria-hidden="true">◍</span>
              <span className="empty-state-headline">No places yet</span>
              <p>
                Search a café by name or paste a District link — the menu, photos and
                location come along with it.
              </p>
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
                  <PlaceCard
                    key={item.id}
                    item={item}
                    isHighlighted={item.id === highlightId}
                    onOpen={setDetailItem}
                    onRemove={removeItem}
                    onToggleComplete={toggleComplete}
                    onTogglePin={togglePin}
                    onUpdateNote={updateNote}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <button className="fab-btn" onClick={() => setIsModalOpen(true)} aria-label="Add place">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span className="fab-label">Add</span>
      </button>

      {isModalOpen && (
        <AddPlaceModal onClose={() => setIsModalOpen(false)} onAdd={addItem} />
      )}

      {detailItem && (
        <PlaceDetailModal
          item={items.find((i) => i.id === detailItem.id) ?? detailItem}
          onClose={() => setDetailItem(null)}
        />
      )}

      {addError && <div className="error-toast" role="alert">{addError}</div>}

      <SpotlightSearch
        open={spotlightOpen}
        onClose={onSpotlightClose}
        items={items}
        onSelect={selectItem}
        placeholder="Search saved places…"
      />
    </div>
  );
}
