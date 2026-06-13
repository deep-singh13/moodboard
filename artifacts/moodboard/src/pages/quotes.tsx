import { useState, useCallback, useEffect, useRef } from "react";
import type { MoodboardItem } from "@/types";
import { fetchItems, createItem, deleteItem, patchItemEdit } from "@/lib/api";
import { QuoteCard } from "@/components/QuoteCard";
import { SpotlightSearch } from "@/components/SpotlightSearch";
import { AddQuoteModal } from "@/components/AddQuoteModal";
import { EditQuoteModal } from "@/components/EditQuoteModal";

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


interface QuotesProps {
  spotlightOpen: boolean;
  onSpotlightClose: () => void;
}

export default function Quotes({ spotlightOpen, onSpotlightClose }: QuotesProps) {
  const [items, setItems] = useState<MoodboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<MoodboardItem | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchItems("quotes")
      .then((loaded) => { setItems(loaded); setLoading(false); })
      .catch(() => { setLoadError(true); setLoading(false); });
  }, []);

  const addItem = useCallback((item: MoodboardItem) => {
    setItems((prev) => [...prev, item]);
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

  const updateItem = useCallback(
    (id: string, updates: { title: string; subtitle: string | null; meta: string }) => {
      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== id) return i;
          return {
            ...i,
            title: updates.title,
            subtitle: updates.subtitle ?? undefined,
            meta: updates.meta,
          };
        }),
      );
      patchItemEdit(id, {
        title: updates.title,
        subtitle: updates.subtitle,
        meta: updates.meta,
      }).catch(() => {});
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

  const displayed = items;

  const numCols = useColumnCount();
  const columns: MoodboardItem[][] = Array.from({ length: numCols }, () => []);
  displayed.forEach((item, i) => columns[i % numCols].push(item));

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
                    onRemove={removeItem}
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
        <AddQuoteModal onClose={() => setIsModalOpen(false)} onAdd={addItem} />
      )}

      {editItem && (
        <EditQuoteModal
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
