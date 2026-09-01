import { useState, useCallback, useRef } from "react";
import type { MoodboardItem } from "@/types";
import { refreshItemPrice } from "@/lib/api";
import { DiscoverCard } from "@/components/DiscoverCard";
import { ParallaxColumns } from "@/components/ParallaxColumns";
import { AddDiscoverModal } from "@/components/AddDiscoverModal";
import { EditDiscoverItemModal } from "@/components/EditDiscoverItemModal";
import { SpotlightSearch } from "@/components/SpotlightSearch";
import { useColumnCount, toColumns } from "@/lib/gridUtils";
import { useBoard } from "@/lib/useBoard";
import { useHighlight } from "@/lib/useHighlight";

type TypeFilter = "all" | "movie" | "reel" | "link";
type StatusFilter = "all" | "want" | "done";

interface DiscoverProps {
  spotlightOpen: boolean;
  onSpotlightClose: () => void;
}


export default function Discover({ spotlightOpen, onSpotlightClose }: DiscoverProps) {
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
    replace,
  } = useBoard({ board: "discover" });
  const { highlightId, highlight } = useHighlight(".discover-page");
  const pageRef = useRef<HTMLDivElement>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [thumbToast, setThumbToast] = useState(false);
  const [editItem, setEditItem] = useState<MoodboardItem | null>(null);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());

  const refreshPrice = useCallback(
    (id: string) => {
      setRefreshingIds((prev) => new Set(prev).add(id));
      refreshItemPrice(id)
        .then(replace)
        .catch(() => {})
        .finally(() => {
          setRefreshingIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        });
    },
    [replace],
  );

  const addItem = useCallback(
    (item: MoodboardItem) => {
      add(item).then((saved) => {
        if (saved && item.type === "link") refreshPrice(item.id);
      });
    },
    [add, refreshPrice],
  );

  // The Add modal calls this if a reel/link's background thumbnail fetch
  // came up empty — the stub is added instantly, before we know that.
  const notifyMissingThumbnail = useCallback(() => {
    setThumbToast(true);
    setTimeout(() => setThumbToast(false), 5000);
  }, []);

  const selectItem = useCallback(
    (item: MoodboardItem) => {
      onSpotlightClose();
      highlight(item.id);
    },
    [onSpotlightClose, highlight],
  );

  const displayed = items.filter((item) => {
    if (typeFilter !== "all" && item.type !== typeFilter) return false;
    if (statusFilter === "want" && item.completed) return false;
    if (statusFilter === "done" && !item.completed) return false;
    return true;
  });

  const numCols = useColumnCount();
  const columns = toColumns(displayed, numCols);

  const chipClass = (active: boolean) => `filter-chip${active ? " active" : ""}`;

  return (
    <div className="discover-page" ref={pageRef}>
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
          <ParallaxColumns
            columns={columns}
            scrollContainerRef={pageRef}
            renderItem={(item) => (
              <DiscoverCard
                key={item.id}
                item={item}
                isHighlighted={item.id === highlightId}
                onRemove={remove}
                onToggleComplete={toggleComplete}
                onTogglePin={togglePin}
                onUpdateNote={updateNote}
                onRefreshPrice={refreshPrice}
                isRefreshingPrice={refreshingIds.has(item.id)}
                onEdit={(id) => {
                  const found = items.find((i) => i.id === id);
                  if (found) setEditItem(found);
                }}
              />
            )}
          />
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
        <AddDiscoverModal
          onClose={() => setIsModalOpen(false)}
          onAdd={addItem}
          onUpdate={update}
          onMissingThumbnail={notifyMissingThumbnail}
        />
      )}

      {editItem && (
        <EditDiscoverItemModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSave={(updates) => {
            update(editItem.id, updates);
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
