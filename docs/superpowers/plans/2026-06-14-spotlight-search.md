# Spotlight Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace inline topbar search with a centered, macOS-Spotlight-style modal — opened by ⌘K or a topbar trigger — that searches the active tab's items, shows them as a thumbnail tile grid, and jumps the view to the selected item.

**Architecture:** One generic presentational `SpotlightSearch` component (filtering, tile grid, keyboard nav) is rendered once per tab. `Moodboard` owns a single `spotlightOpen` flag, exposes it to the Board directly and passes it to `Discover`/`Quotes` as props. Each tab supplies its own `items` and its own `onSelect` (Board pans the canvas; Discover/Quotes scroll the grid). All prior inline `searchQuery` filtering is removed.

**Tech Stack:** React + TypeScript + Vite, plain CSS (`index.css`), no test runner in repo — verification is `pnpm typecheck` + `pnpm build` + manual browser checks (the established pattern for this project).

**Working directory:** All paths below are relative to `artifacts/moodboard/`. Run `pnpm` commands from `artifacts/moodboard/`.

---

## File Structure

- **Create** `src/components/SpotlightSearch.tsx` — the modal: query state, filter, tile grid, keyboard nav. Tab-agnostic.
- **Modify** `src/index.css` — Spotlight modal/tile styles + a `data-highlight` pulse for grid cards.
- **Modify** `src/pages/moodboard.tsx` — `spotlightOpen` state, ⌘K toggle, topbar trigger button, Board `SpotlightSearch`, route props to Discover/Quotes, remove inline filtering.
- **Modify** `src/pages/discover.tsx` — accept `spotlightOpen`/`onSpotlightClose`, render own `SpotlightSearch`, `highlightId` + scroll-to-card, drop `searchQuery`.
- **Modify** `src/pages/quotes.tsx` — same wiring as Discover.
- **Modify** `src/components/DiscoverCard.tsx` — accept `isHighlighted`, set `data-item-id`.
- **Modify** `src/components/QuoteCard.tsx` — accept `isHighlighted`, set `data-item-id`.

---

## Task 1: SpotlightSearch component

**Files:**
- Create: `src/components/SpotlightSearch.tsx`

- [ ] **Step 1: Create the component file**

Create `src/components/SpotlightSearch.tsx`:

```tsx
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
```

- [ ] **Step 2: Typecheck**

Run from `artifacts/moodboard/`: `pnpm typecheck`
Expected: PASS (no errors). The component is not yet imported anywhere, which is fine.

- [ ] **Step 3: Commit**

```bash
git add src/components/SpotlightSearch.tsx
git commit -m "feat(search): add SpotlightSearch modal component"
```

---

## Task 2: Spotlight styles

**Files:**
- Modify: `src/index.css` (append a new section at end of file)

- [ ] **Step 1: Append styles**

Append to the end of `src/index.css`:

```css
/* ── Spotlight search ─────────────────────────────────────── */
.spotlight-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 16vh;
  background: rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  animation: spotlight-fade 0.12s ease-out;
}

.spotlight-panel {
  width: min(640px, 92vw);
  max-height: 64vh;
  display: flex;
  flex-direction: column;
  background: var(--bg, #fff);
  border: 1px solid var(--border, rgba(0, 0, 0, 0.08));
  border-radius: 16px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
  overflow: hidden;
  animation: spotlight-pop 0.14s cubic-bezier(0.2, 0.8, 0.2, 1);
}

[data-theme="dark"] .spotlight-panel {
  background: #1c1c1e;
  border-color: rgba(255, 255, 255, 0.1);
}

.spotlight-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border, rgba(0, 0, 0, 0.07));
}

.spotlight-input-icon { color: var(--muted, #8a8a8e); flex-shrink: 0; }

.spotlight-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 18px;
  color: inherit;
}
.spotlight-input::placeholder { color: var(--muted, #b0b0b5); }

.spotlight-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 16px;
  overflow-y: auto;
}

.spotlight-tile {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s ease, border-color 0.1s ease;
}
.spotlight-tile.active {
  background: var(--hover, rgba(0, 0, 0, 0.05));
  border-color: var(--border, rgba(0, 0, 0, 0.1));
}
[data-theme="dark"] .spotlight-tile.active {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.14);
}

.spotlight-tile-thumb {
  aspect-ratio: 1 / 1;
  border-radius: 8px;
  overflow: hidden;
  background: var(--hover, rgba(0, 0, 0, 0.05));
}
.spotlight-tile-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.spotlight-tile-thumb--text {
  display: flex;
  align-items: center;
  padding: 10px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--muted, #6a6a6e);
  overflow: hidden;
}

.spotlight-tile-meta { display: flex; flex-direction: column; gap: 3px; }
.spotlight-tile-title {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.spotlight-tile-badge {
  font-size: 11px;
  color: var(--muted, #8a8a8e);
}

.spotlight-empty {
  padding: 40px 16px;
  text-align: center;
  color: var(--muted, #8a8a8e);
  font-size: 14px;
}

@keyframes spotlight-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes spotlight-pop {
  from { opacity: 0; transform: translateY(-8px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* Highlight pulse for grid cards jumped-to from Spotlight */
[data-highlight="true"] {
  animation: spotlight-card-pulse 1.6s ease-out;
}
@keyframes spotlight-card-pulse {
  0% { box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.6); }
  100% { box-shadow: 0 0 0 3px rgba(99, 102, 241, 0); }
}

@media (max-width: 640px) {
  .spotlight-grid { grid-template-columns: repeat(2, 1fr); }
}
```

> Note: `var(--bg, …)` etc. use fallbacks so styles work even if a token is absent. If the project already defines these CSS variables, they will be picked up automatically.

- [ ] **Step 2: Commit**

```bash
git add src/index.css
git commit -m "style(search): add Spotlight modal and card-pulse styles"
```

---

## Task 3: Wire Board spotlight + remove inline search

**Files:**
- Modify: `src/pages/moodboard.tsx`

- [ ] **Step 1: Import the component**

In `src/pages/moodboard.tsx`, add to the imports near the other component imports (the `import Quotes from "@/pages/quotes";` line region, ~line 15):

```tsx
import { SpotlightSearch } from "@/components/SpotlightSearch";
```

- [ ] **Step 2: Replace search state with spotlight state**

Find (~line 137-143):

```tsx
  const [searchQuery, setSearchQuery] = useState("");
```

Replace with:

```tsx
  const [spotlightOpen, setSpotlightOpen] = useState(false);
```

Then find and DELETE the now-unused ref (~line 143):

```tsx
  const searchInputRef = useRef<HTMLInputElement>(null);
```

- [ ] **Step 3: Add the board-select handler**

Immediately after the `scrollToItem` `useCallback` (it ends ~line 197), add:

```tsx
  const selectBoardItem = useCallback(
    (item: MoodboardItem) => {
      setSpotlightOpen(false);
      if (surpriseTimerRef.current) clearTimeout(surpriseTimerRef.current);
      setSurpriseId(item.id);
      scrollToItem(item);
      surpriseTimerRef.current = setTimeout(() => setSurpriseId(null), 2000);
    },
    [scrollToItem],
  );
```

- [ ] **Step 4: Simplify handleSurpriseMe (drop searchQuery)**

Find the start of `handleSurpriseMe` (~line 285):

```tsx
    const pool = (searchQuery
      ? layoutItems.filter((item) => matchesSearch(item, searchQuery))
      : layoutItems
    ).filter((item) => !item.completed);
```

Replace with:

```tsx
    const pool = layoutItems.filter((item) => !item.completed);
```

Then update its dependency array at the end of the callback:

```tsx
  }, [layoutItems, searchQuery, surpriseId, scrollToItem]);
```

becomes

```tsx
  }, [layoutItems, surpriseId, scrollToItem]);
```

- [ ] **Step 5: Replace the keyboard handler**

Find the `onKeyDown` effect (~line 437-455):

```tsx
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === "Escape") {
        if (searchQuery) {
          setSearchQuery("");
          searchInputRef.current?.blur();
          return;
        }
        if (isModalOpen) setIsModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isModalOpen, searchQuery]);
```

Replace with:

```tsx
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSpotlightOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && isModalOpen) {
        setIsModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isModalOpen]);
```

- [ ] **Step 6: Remove inline filtering computed values**

Find (~line 464-469):

```tsx
  const displayedItems = searchQuery
    ? layoutItems.filter((item) => matchesSearch(item, searchQuery))
    : layoutItems;

  const showSearchEmpty =
    !!searchQuery && displayedItems.length === 0 && !loading && !loadError && items.length > 0;
```

Replace with:

```tsx
  const displayedItems = layoutItems;
```

- [ ] **Step 7: Replace the topbar search input with a trigger button**

Find the whole `{/* Search — shared, always visible */}` block (the `<div className="search-wrap">…</div>`, ~line 522-557) and replace it with:

```tsx
        {/* Search — shared trigger; opens Spotlight modal */}
        <button
          className="search-trigger"
          onClick={() => setSpotlightOpen(true)}
          aria-label="Open search"
        >
          <svg
            className="search-icon"
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <span className="search-trigger-label">Search…</span>
          <kbd className="search-trigger-kbd">⌘K</kbd>
        </button>
```

- [ ] **Step 8: Remove the board search-empty-state block**

Find and DELETE (~line 618-624):

```tsx
        {showSearchEmpty && (
          <div className="search-empty-state">
            <div className="search-empty-inner">
              <p>No results for &ldquo;{searchQuery}&rdquo;</p>
            </div>
          </div>
        )}
```

- [ ] **Step 9: Route props to Discover/Quotes and render the Board spotlight**

Find (~line 645-653):

```tsx
      {/* Discover page — manages its own FAB and modal */}
      {activeTab === "discover" && (
        <Discover searchQuery={searchQuery} />
      )}

      {/* Quotes page — manages its own FAB and modal */}
      {activeTab === "quotes" && (
        <Quotes searchQuery={searchQuery} />
      )}
```

Replace with:

```tsx
      {/* Discover page — manages its own FAB and modal */}
      {activeTab === "discover" && (
        <Discover
          spotlightOpen={spotlightOpen}
          onSpotlightClose={() => setSpotlightOpen(false)}
        />
      )}

      {/* Quotes page — manages its own FAB and modal */}
      {activeTab === "quotes" && (
        <Quotes
          spotlightOpen={spotlightOpen}
          onSpotlightClose={() => setSpotlightOpen(false)}
        />
      )}

      {/* Board spotlight */}
      <SpotlightSearch
        open={spotlightOpen && activeTab === "board"}
        onClose={() => setSpotlightOpen(false)}
        items={layoutItems}
        onSelect={selectBoardItem}
        placeholder="Search the board…"
      />
```

- [ ] **Step 10: Add trigger-button styles**

Append to the end of `src/index.css` (these style the new topbar trigger to roughly match the old `.search-wrap` footprint):

```css
.search-trigger {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border, rgba(0, 0, 0, 0.1));
  border-radius: 8px;
  background: var(--hover, rgba(0, 0, 0, 0.03));
  color: var(--muted, #8a8a8e);
  cursor: pointer;
  font-size: 13px;
}
.search-trigger:hover { border-color: var(--border, rgba(0, 0, 0, 0.18)); }
.search-trigger-label { flex: 1; text-align: left; }
.search-trigger-kbd {
  font-size: 11px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--border, rgba(0, 0, 0, 0.08));
  color: var(--muted, #8a8a8e);
}
[data-theme="dark"] .search-trigger {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.12);
}
```

- [ ] **Step 11: Verify `matchesSearch` is still used**

The file-level `matchesSearch` helper in `moodboard.tsx` is no longer referenced after Step 4/6. Run `pnpm typecheck` — if it reports `matchesSearch is declared but never read`, DELETE the `matchesSearch` function (~line 110-116) in `moodboard.tsx`. If it is still referenced elsewhere, leave it.

Run from `artifacts/moodboard/`: `pnpm typecheck`
Expected: PASS (no errors).

- [ ] **Step 12: Build**

Run: `pnpm build`
Expected: build succeeds with no type errors.

- [ ] **Step 13: Commit**

```bash
git add src/pages/moodboard.tsx src/index.css
git commit -m "feat(search): wire Board Spotlight, remove inline board search"
```

---

## Task 4: Wire Discover spotlight

**Files:**
- Modify: `src/pages/discover.tsx`
- Modify: `src/components/DiscoverCard.tsx`

- [ ] **Step 1: DiscoverCard — accept `isHighlighted` + `data-item-id`**

In `src/components/DiscoverCard.tsx`, add to the props interface (~line 4-10):

```tsx
interface DiscoverCardProps {
  item: MoodboardItem;
  onRemove: (id: string) => void;
  onToggleComplete: (id: string) => void;
  onUpdateNote?: (id: string, note: string | null) => void;
  onEdit?: (id: string) => void;
  isHighlighted?: boolean;
}
```

Destructure it in the component signature (find `export function DiscoverCard({ ... })`) by adding `isHighlighted` to the destructured params.

Then update the root element (~line 170-173):

```tsx
    <div
      className={`discover-card ${completedClass}`}
      onClick={handleClick}
    >
```

to:

```tsx
    <div
      className={`discover-card ${completedClass}`}
      data-item-id={item.id}
      data-highlight={isHighlighted ? "true" : undefined}
      onClick={handleClick}
    >
```

- [ ] **Step 2: Discover — swap props, add spotlight + scroll-to**

In `src/pages/discover.tsx`, replace the props interface (~line 28-30):

```tsx
interface DiscoverProps {
  searchQuery: string;
}
```

with:

```tsx
interface DiscoverProps {
  spotlightOpen: boolean;
  onSpotlightClose: () => void;
}
```

Update the component signature:

```tsx
export default function Discover({ searchQuery }: DiscoverProps) {
```

to:

```tsx
export default function Discover({ spotlightOpen, onSpotlightClose }: DiscoverProps) {
```

- [ ] **Step 3: Add import + highlight state + select handler**

Add the import near the top with the other component imports:

```tsx
import { SpotlightSearch } from "@/components/SpotlightSearch";
```

Add a highlight state alongside the other `useState` calls in the component body:

```tsx
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
```

Add `useRef` to the React import at the top of the file if not already present (it currently imports `useState, useCallback, useEffect`):

```tsx
import { useState, useCallback, useEffect, useRef } from "react";
```

Add the select handler in the component body (e.g. just before `const displayed = ...`):

```tsx
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
```

- [ ] **Step 4: Remove inline search from the `displayed` filter**

Find (~line 110-117):

```tsx
  const displayed = items.filter((item) => {
    if (typeFilter !== "all" && item.type !== typeFilter) return false;
    if (statusFilter === "want" && item.completed) return false;
    if (statusFilter === "done" && !item.completed) return false;
    if (!matchesSearch(item, searchQuery)) return false;
    return true;
  });
```

Replace with:

```tsx
  const displayed = items.filter((item) => {
    if (typeFilter !== "all" && item.type !== typeFilter) return false;
    if (statusFilter === "want" && item.completed) return false;
    if (statusFilter === "done" && !item.completed) return false;
    return true;
  });
```

Then DELETE the now-unused file-level `matchesSearch` helper (~line 24-30) in `discover.tsx`.

- [ ] **Step 5: Pass `isHighlighted` to DiscoverCard**

Find the `<DiscoverCard` JSX (~line 192) and add the prop:

```tsx
                  <DiscoverCard
                    key={item.id}
                    item={item}
                    isHighlighted={item.id === highlightId}
                    onRemove={removeItem}
```

(keep the remaining existing props unchanged)

- [ ] **Step 6: Render the Discover spotlight**

At the end of the component's returned JSX — just before the final closing `</div>` of the outermost `discover-page` wrapper (or alongside the existing modals near the end of the return) — add:

```tsx
      <SpotlightSearch
        open={spotlightOpen}
        onClose={onSpotlightClose}
        items={items}
        onSelect={selectItem}
        placeholder="Search saved items…"
      />
```

- [ ] **Step 7: Typecheck + build**

Run from `artifacts/moodboard/`: `pnpm typecheck && pnpm build`
Expected: PASS / build succeeds. If `matchesSearch` or `searchQuery` errors as unused/undefined, ensure Step 4 deletions are complete.

- [ ] **Step 8: Commit**

```bash
git add src/pages/discover.tsx src/components/DiscoverCard.tsx
git commit -m "feat(search): per-tab Spotlight for Discover with scroll-to"
```

---

## Task 5: Wire Quotes spotlight

**Files:**
- Modify: `src/pages/quotes.tsx`
- Modify: `src/components/QuoteCard.tsx`

- [ ] **Step 1: QuoteCard — accept `isHighlighted` + `data-item-id`**

In `src/components/QuoteCard.tsx`, add `isHighlighted?: boolean;` to `QuoteCardProps` (~line 3) and add it to the destructured params of `export function QuoteCard({ item, onRemove, onEdit })` → `({ item, onRemove, onEdit, isHighlighted })`.

Update the root element (~line 37):

```tsx
    <div className={`quote-card quote-card--${color}`}>
```

to:

```tsx
    <div
      className={`quote-card quote-card--${color}`}
      data-item-id={item.id}
      data-highlight={isHighlighted ? "true" : undefined}
    >
```

- [ ] **Step 2: Quotes — swap props**

In `src/pages/quotes.tsx`, replace the props interface (~line 32-34):

```tsx
interface QuotesProps {
  searchQuery: string;
}
```

with:

```tsx
interface QuotesProps {
  spotlightOpen: boolean;
  onSpotlightClose: () => void;
}
```

Update the signature `export default function Quotes({ searchQuery }: QuotesProps)` to `export default function Quotes({ spotlightOpen, onSpotlightClose }: QuotesProps)`.

- [ ] **Step 3: Imports + highlight state + select handler**

Ensure the React import includes `useRef`:

```tsx
import { useState, useCallback, useEffect, useRef } from "react";
```

Add the component import near the top:

```tsx
import { SpotlightSearch } from "@/components/SpotlightSearch";
```

Add state in the component body:

```tsx
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
```

Add the select handler just before `const displayed = ...`:

```tsx
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
```

- [ ] **Step 4: Remove inline search + unused helper**

Find (~line 86):

```tsx
  const displayed = items.filter((item) => matchesSearch(item, searchQuery));
```

Replace with:

```tsx
  const displayed = items;
```

Then DELETE the file-level `matchesSearch` helper (~line 24-30) in `quotes.tsx`.

- [ ] **Step 5: Pass `isHighlighted` to QuoteCard**

Find the `<QuoteCard` JSX (~line 142) and add the prop:

```tsx
                  <QuoteCard
                    key={item.id}
                    item={item}
                    isHighlighted={item.id === highlightId}
                    onRemove={removeItem}
```

(keep the remaining existing props unchanged)

- [ ] **Step 6: Render the Quotes spotlight**

Just before the final closing `</div>` of the outermost `discover-page` wrapper (or alongside the existing modals near the end of the return), add:

```tsx
      <SpotlightSearch
        open={spotlightOpen}
        onClose={onSpotlightClose}
        items={items}
        onSelect={selectItem}
        placeholder="Search quotes…"
      />
```

- [ ] **Step 7: Typecheck + build**

Run from `artifacts/moodboard/`: `pnpm typecheck && pnpm build`
Expected: PASS / build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/pages/quotes.tsx src/components/QuoteCard.tsx
git commit -m "feat(search): per-tab Spotlight for Quotes with scroll-to"
```

---

## Task 6: Manual verification

- [ ] **Step 1: Run the dev server**

Run from `artifacts/moodboard/`: `pnpm dev`
Open the served URL in a browser.

- [ ] **Step 2: Board tab checks**

- Press ⌘K (or Ctrl+K): the Spotlight modal opens centered, input focused.
- Type part of a substack/youtube title: results filter to a tile grid with thumbnails + type badges.
- Arrow keys move the active tile; Enter selects.
- On select: modal closes, the canvas pans to the item, and the tile briefly pulses.
- Click the topbar "Search… ⌘K" trigger: modal opens. Esc closes it. Clicking the backdrop closes it.

- [ ] **Step 3: Discover tab checks**

- Switch to Discover. ⌘K opens a Spotlight that lists **only** Discover items.
- Selecting a result scrolls the masonry to that card and pulses it.

- [ ] **Step 4: Quotes tab checks**

- Switch to Quotes. ⌘K opens a Spotlight listing **only** quotes (text-fallback tiles, no thumbnails).
- Selecting a result scrolls to that quote card and pulses it.

- [ ] **Step 5: Theme check**

- Toggle dark mode; reopen Spotlight on each tab; confirm panel, tiles, and trigger render correctly in both themes.

---

## Notes / Self-Review

- **Spec coverage:** Centered modal (Task 1+2), ⌘K + topbar trigger (Task 3), per-tab item scope (Tasks 3/4/5 each pass that tab's own `items`), tile grid with thumbnails + text fallback (Task 1), keyboard nav (Task 1), jump-to: Board pan + pulse (Task 3 `selectBoardItem`), Discover/Quotes scroll + pulse (Tasks 4/5), removal of all inline `searchQuery` filtering (Tasks 3/4/5), theme-aware styling (Task 2). All covered.
- **No test runner:** repo has none; verification is typecheck/build/manual, matching the project's existing pattern.
- **Type consistency:** `SpotlightSearchProps` (`open`, `onClose`, `items`, `onSelect`, `placeholder`) is used identically in all three call sites. `isHighlighted?` added to both card prop types. `data-highlight`/`data-item-id` attribute names match the CSS selector in Task 2 and the `querySelector` in Tasks 4/5.
- **Approx line numbers** are guides — match on the quoted code, not the number, since earlier edits shift later lines.
```
