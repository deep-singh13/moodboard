import { useState, useCallback, useEffect } from "react";
import type { MoodboardItem } from "@/types";
import { fetchItems, createItem, deleteItem, patchItemComplete, patchItemNote } from "@/lib/api";
import { DiscoverCard } from "@/components/DiscoverCard";
import { AddDiscoverModal } from "@/components/AddDiscoverModal";

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
  searchQuery: string;
}

function matchesSearch(item: MoodboardItem, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  return [item.title ?? "", item.subtitle ?? "", item.note ?? ""].some((f) =>
    f.toLowerCase().includes(q),
  );
}

export default function Discover({ searchQuery }: DiscoverProps) {
  const [items, setItems] = useState<MoodboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    fetchItems("discover")
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

  const displayed = items.filter((item) => {
    if (typeFilter !== "all" && item.type !== typeFilter) return false;
    if (statusFilter === "want" && item.completed) return false;
    if (statusFilter === "done" && !item.completed) return false;
    if (!matchesSearch(item, searchQuery)) return false;
    return true;
  });

  const numCols = useColumnCount();
  const columns: MoodboardItem[][] = Array.from({ length: numCols }, () => []);
  displayed.forEach((item, i) => columns[i % numCols].push(item));

  const chipClass = (active: boolean) => `filter-chip${active ? " active" : ""}`;

  return (
    <div className="discover-page">
      <div className="discover-header">
        <span className="discover-title">Discover</span>
        <span className="discover-count">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>

      {/* Filter chips */}
      <div className="discover-filters">
        <button className={chipClass(typeFilter === "all")}   onClick={() => setTypeFilter("all")}>All</button>
        <button className={chipClass(typeFilter === "movie")} onClick={() => setTypeFilter("movie")}>🎬 Movies</button>
        <button className={chipClass(typeFilter === "reel")}  onClick={() => setTypeFilter("reel")}>▶ Reels</button>
        <button className={chipClass(typeFilter === "link")}  onClick={() => setTypeFilter("link")}>🔗 Links</button>
        <button className={chipClass(statusFilter === "want")} onClick={() => setStatusFilter(statusFilter === "want" ? "all" : "want")} style={{ marginLeft: "auto" }}>
          Want to watch
        </button>
        <button className={chipClass(statusFilter === "done")} onClick={() => setStatusFilter(statusFilter === "done" ? "all" : "done")}>
          Watched
        </button>
      </div>

      {/* States */}
      {loading && (
        <div className="discover-empty">
          <div className="canvas-loading">
            <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
          </div>
        </div>
      )}

      {loadError && (
        <div className="discover-empty">
          <div className="discover-empty-inner">
            <p>Couldn't connect — please refresh.</p>
          </div>
        </div>
      )}

      {!loading && !loadError && items.length === 0 && (
        <div className="discover-empty">
          <div className="discover-empty-inner">
            <span className="empty-state-headline">Start discovering</span>
            <p>Add a movie, Instagram reel, or website link to begin</p>
          </div>
        </div>
      )}

      {!loading && !loadError && items.length > 0 && displayed.length === 0 && (
        <div className="discover-empty">
          <div className="discover-empty-inner">
            <p>No items match the current filters.</p>
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
                  onRemove={removeItem}
                  onToggleComplete={toggleComplete}
                  onUpdateNote={updateNote}
                />
              ))}
            </div>
          ))}
        </div>
      )}

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

      {addError && (
        <div className="error-toast" role="alert">{addError}</div>
      )}
    </div>
  );
}
