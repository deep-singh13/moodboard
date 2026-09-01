import { useState, useCallback, useRef } from "react";
import type { MoodboardItem } from "@/types";
import { useColumnCount, toColumns } from "@/lib/gridUtils";
import { useBoard } from "@/lib/useBoard";
import { useHighlight } from "@/lib/useHighlight";
import { PlaceCard } from "@/components/PlaceCard";
import { ParallaxColumns } from "@/components/ParallaxColumns";
import { AddPlaceModal } from "@/components/AddPlaceModal";
import { PlaceDetailModal } from "@/components/PlaceDetailModal";
import { SpotlightSearch } from "@/components/SpotlightSearch";

type StatusFilter = "all" | "want" | "been";

interface PlacesProps {
  spotlightOpen: boolean;
  onSpotlightClose: () => void;
}

export default function Places({ spotlightOpen, onSpotlightClose }: PlacesProps) {
  const {
    items,
    loading,
    loadError,
    addError,
    add,
    remove,
    toggleComplete,
    togglePin,
    updateNote,
    update,
  } = useBoard({ board: "places" });
  const { highlightId, highlight } = useHighlight(".places-page");
  const pageRef = useRef<HTMLDivElement>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [detailItem, setDetailItem] = useState<MoodboardItem | null>(null);

  // Deleting the place the detail modal is showing has to close it too.
  const removeItem = useCallback(
    (id: string) => {
      setDetailItem((current) => (current?.id === id ? null : current));
      remove(id);
    },
    [remove],
  );

  const selectItem = useCallback(
    (item: MoodboardItem) => {
      onSpotlightClose();
      highlight(item.id);
    },
    [onSpotlightClose, highlight],
  );

  const displayed = items.filter((item) => {
    if (statusFilter === "want" && item.completed) return false;
    if (statusFilter === "been" && !item.completed) return false;
    return true;
  });

  const numCols = useColumnCount();
  const columns = toColumns(displayed, numCols);

  const chipClass = (active: boolean) => `filter-chip${active ? " active" : ""}`;

  return (
    <div className="places-page discover-page" ref={pageRef}>
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
          <ParallaxColumns
            columns={columns}
            scrollContainerRef={pageRef}
            renderItem={(item) => (
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
            )}
          />
        )}
      </div>

      <button className="fab-btn" onClick={() => setIsModalOpen(true)} aria-label="Add place">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span className="fab-label">Add</span>
      </button>

      {isModalOpen && (
        <AddPlaceModal
          onClose={() => setIsModalOpen(false)}
          onAdd={add}
          onUpdate={update}
        />
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
