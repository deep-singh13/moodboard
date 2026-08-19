import { useState, useCallback } from "react";
import type { MoodboardItem } from "@/types";
import { QuoteCard } from "@/components/QuoteCard";
import { SpotlightSearch } from "@/components/SpotlightSearch";
import { AddQuoteModal } from "@/components/AddQuoteModal";
import { EditQuoteModal } from "@/components/EditQuoteModal";
import { useColumnCount, toColumns } from "@/lib/gridUtils";
import { useBoard } from "@/lib/useBoard";
import { useHighlight } from "@/lib/useHighlight";

interface QuotesProps {
  spotlightOpen: boolean;
  onSpotlightClose: () => void;
}

export default function Quotes({ spotlightOpen, onSpotlightClose }: QuotesProps) {
  const { items, loading, loadError, addError, add, remove, togglePin, update } =
    useBoard({ board: "quotes" });
  const { highlightId, highlight } = useHighlight(".discover-page");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<MoodboardItem | null>(null);

  const selectItem = useCallback(
    (item: MoodboardItem) => {
      onSpotlightClose();
      highlight(item.id);
    },
    [onSpotlightClose, highlight],
  );

  const displayed = items;

  const numCols = useColumnCount();
  const columns = toColumns(displayed, numCols);

  return (
    <div className="discover-page">
      <div className="discover-page-inner">
        <header className="discover-header">
          <span className="discover-eyebrow">Words that stayed</span>
          <h1 className="discover-title">Quotes</h1>
          <span className="discover-meta tnum">{items.length} saved</span>
        </header>

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
              <span className="empty-state-headline">No quotes yet</span>
              <p>Save a line that stuck with you.</p>
            </div>
          </div>
        )}

        {!loading && !loadError && items.length > 0 && displayed.length === 0 && (
          <div className="discover-empty">
            <div className="discover-empty-inner">
              <p>No quotes match that search.</p>
            </div>
          </div>
        )}

        {!loading && !loadError && displayed.length > 0 && (
          <div className="discover-masonry">
            {columns.map((col, ci) => (
              <div key={ci} className="discover-col">
                {col.map((item) => (
                  <QuoteCard
                    key={item.id}
                    item={item}
                    isHighlighted={item.id === highlightId}
                    onRemove={remove}
                    onTogglePin={togglePin}
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

      <button className="fab-btn" onClick={() => setIsModalOpen(true)} aria-label="Add quote">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span className="fab-label">Add</span>
      </button>

      {isModalOpen && (
        <AddQuoteModal onClose={() => setIsModalOpen(false)} onAdd={add} />
      )}

      {editItem && (
        <EditQuoteModal
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

      <SpotlightSearch
        open={spotlightOpen}
        onClose={onSpotlightClose}
        items={items}
        onSelect={selectItem}
        placeholder="Search quotes…"
      />
    </div>
  );
}
