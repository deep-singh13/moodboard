# Quotes Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Quotes" third tab to the moodboard app where the user can save, display, and edit personal quotes with optional author attribution, shown in a Pinterest-style masonry grid with soft pastel card backgrounds.

**Architecture:** A new `"quote"` item type is added to the existing `MoodboardItem` union and stored via `board: "quotes"` — no DB or API route changes needed beyond extending the PATCH handler to support `subtitle` and `meta` fields. A new `Quotes` page mirrors the `Discover` page structure, and three new components (`QuoteCard`, `AddQuoteModal`, `EditQuoteModal`) follow the exact patterns already established in the codebase.

**Tech Stack:** React 18, TypeScript, Vite, CSS custom properties (OKLCH), existing Express/PostgreSQL API

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `artifacts/moodboard/src/types/index.ts` | Add `"quote"` to type union |
| Modify | `artifacts/api-server/src/routes/items.ts` | Add `subtitle` + `meta` to PATCH handler |
| Modify | `artifacts/moodboard/src/lib/api.ts` | Add `subtitle` + `meta` to `patchItemEdit` |
| Modify | `artifacts/moodboard/src/index.css` | Quote card color vars, card styles, color pills |
| Create | `artifacts/moodboard/src/components/QuoteCard.tsx` | Pastel card with quote text + author |
| Create | `artifacts/moodboard/src/components/AddQuoteModal.tsx` | Add quote drawer modal |
| Create | `artifacts/moodboard/src/components/EditQuoteModal.tsx` | Edit quote drawer modal |
| Create | `artifacts/moodboard/src/pages/quotes.tsx` | Masonry page, fetches board="quotes" |
| Modify | `artifacts/moodboard/src/pages/moodboard.tsx` | Add Quotes tab + conditional render |

---

## Task 1: Extend type definitions and backend PATCH handler

**Files:**
- Modify: `artifacts/moodboard/src/types/index.ts`
- Modify: `artifacts/api-server/src/routes/items.ts`

- [ ] **Step 1: Add `"quote"` to the MoodboardItem type union**

In `artifacts/moodboard/src/types/index.ts`, change line 3:

```ts
// Before
type: "substack" | "youtube" | "link" | "photo" | "movie" | "reel";

// After
type: "substack" | "youtube" | "link" | "photo" | "movie" | "reel" | "quote";
```

- [ ] **Step 2: Add `subtitle` and `meta` patching to the backend PATCH handler**

In `artifacts/api-server/src/routes/items.ts`, find the PATCH route handler. The `body` type declaration currently is:

```ts
const body = req.body as {
  completed?: boolean;
  note?: string | null;
  title?: string | null;
  imageUrl?: string | null;
};
```

Replace it with:

```ts
const body = req.body as {
  completed?: boolean;
  note?: string | null;
  title?: string | null;
  imageUrl?: string | null;
  subtitle?: string | null;
  meta?: string | null;
};
```

Then, inside the same handler, after the existing `if ("title" in body)` block, add:

```ts
if ("subtitle" in body) {
  await pool.query("UPDATE items SET subtitle = $1 WHERE id = $2", [
    body.subtitle ?? null,
    req.params.id,
  ]);
}
if ("meta" in body) {
  await pool.query("UPDATE items SET meta = $1 WHERE id = $2", [
    body.meta ?? null,
    req.params.id,
  ]);
}
```

- [ ] **Step 3: Verify typecheck passes**

```bash
cd artifacts/api-server && pnpm typecheck
cd artifacts/moodboard && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add artifacts/moodboard/src/types/index.ts artifacts/api-server/src/routes/items.ts
git commit -m "feat(quotes): add quote type + subtitle/meta PATCH support"
```

---

## Task 2: Extend the API client

**Files:**
- Modify: `artifacts/moodboard/src/lib/api.ts`

- [ ] **Step 1: Add `subtitle` and `meta` to `patchItemEdit`**

In `artifacts/moodboard/src/lib/api.ts`, replace the existing `patchItemEdit` function:

```ts
export async function patchItemEdit(
  id: string,
  updates: {
    title?: string | null;
    imageUrl?: string | null;
    subtitle?: string | null;
    meta?: string | null;
  },
): Promise<void> {
  const res = await fetch(`${BASE}/items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Failed to update item: ${res.status}`);
}
```

- [ ] **Step 2: Typecheck**

```bash
cd artifacts/moodboard && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add artifacts/moodboard/src/lib/api.ts
git commit -m "feat(quotes): extend patchItemEdit with subtitle + meta"
```

---

## Task 3: Add CSS for quote cards and color pills

**Files:**
- Modify: `artifacts/moodboard/src/index.css`

- [ ] **Step 1: Add quote card color variables at the end of the `:root` block**

At the bottom of the light-mode `:root { }` block (before `[data-theme="dark"]`), add:

```css
/* Quote card colors — light mode */
--quote-bg-sage:     oklch(0.89 0.05 145);
--quote-bg-blush:    oklch(0.89 0.05 10);
--quote-bg-lavender: oklch(0.89 0.05 290);
--quote-bg-peach:    oklch(0.89 0.06 55);
--quote-bg-sky:      oklch(0.89 0.05 230);
--quote-bg-slate:    oklch(0.89 0.04 250);
--quote-text:        var(--text-primary);
```

At the bottom of the `[data-theme="dark"] { }` block, add:

```css
/* Quote card colors — dark mode */
--quote-bg-sage:     oklch(0.24 0.05 145);
--quote-bg-blush:    oklch(0.24 0.05 10);
--quote-bg-lavender: oklch(0.24 0.05 290);
--quote-bg-peach:    oklch(0.24 0.06 55);
--quote-bg-sky:      oklch(0.24 0.05 230);
--quote-bg-slate:    oklch(0.24 0.04 250);
--quote-text:        oklch(0.92 0.006 70);
```

- [ ] **Step 2: Add quote card styles at the end of `index.css`**

Append to the very end of `artifacts/moodboard/src/index.css`:

```css
/* ============================================================
   QUOTE CARD
   ============================================================ */

.quote-card {
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid transparent;
  position: relative;
  box-shadow: var(--card-shadow);
  padding: var(--space-6) var(--space-5);
  transition: box-shadow 0.22s ease, border-color 0.22s ease, transform 0.22s ease;
  cursor: default;
}

.quote-card:hover {
  box-shadow: var(--card-shadow-hover);
  transform: translateY(-2px);
}

/* Color variants */
.quote-card--sage     { background: var(--quote-bg-sage);     }
.quote-card--blush    { background: var(--quote-bg-blush);    }
.quote-card--lavender { background: var(--quote-bg-lavender); }
.quote-card--peach    { background: var(--quote-bg-peach);    }
.quote-card--sky      { background: var(--quote-bg-sky);      }
.quote-card--slate    { background: var(--quote-bg-slate);    }

.quote-card-text {
  font-family: 'Instrument Serif', Georgia, serif;
  font-style: italic;
  font-size: var(--text-lg);
  line-height: 1.55;
  letter-spacing: var(--tracking-snug);
  color: var(--quote-text);
  margin-bottom: var(--space-4);
  word-break: break-word;
}

.quote-card-author {
  font-family: 'DM Sans', sans-serif;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--quote-text);
  opacity: 0.6;
  letter-spacing: 0.01em;
}

/* Show action buttons on hover */
.quote-card:hover .card-remove       { opacity: 1; }
.quote-card:hover .discover-edit-btn { opacity: 1; }

/* ── Color pill chooser (Add/Edit Quote modals) ── */

.quote-color-pills {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.quote-color-pill {
  padding: 6px 14px;
  border-radius: 100px;
  border: 2px solid transparent;
  font-family: 'DM Sans', sans-serif;
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
  color: oklch(0.22 0.01 70);
  transition: border-color 0.15s ease, transform 0.12s;
  letter-spacing: 0.01em;
}

.quote-color-pill:hover {
  transform: translateY(-1px);
}

.quote-color-pill--sage     { background: oklch(0.89 0.05 145); }
.quote-color-pill--blush    { background: oklch(0.89 0.05 10);  }
.quote-color-pill--lavender { background: oklch(0.89 0.05 290); }
.quote-color-pill--peach    { background: oklch(0.89 0.06 55);  }
.quote-color-pill--sky      { background: oklch(0.89 0.05 230); }
.quote-color-pill--slate    { background: oklch(0.89 0.04 250); }

.quote-color-pill.selected {
  border-color: oklch(0.28 0.02 70 / 0.55);
  transform: scale(1.04);
}

/* Modal textarea (shared by quote modals) */
.modal-textarea {
  width: 100%;
  padding: 12px 15px;
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
  color: var(--text-primary);
  background: transparent;
  border: 1px solid var(--border-input);
  border-radius: 12px;
  outline: none;
  resize: vertical;
  min-height: 100px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  line-height: 1.55;
}

.modal-textarea:focus {
  border-color: var(--bg-btn-add);
  box-shadow: 0 0 0 3px rgba(212, 165, 116, 0.15);
}

.modal-textarea::placeholder {
  color: var(--text-muted);
}

/* Modal field spacing helper */
.modal-field {
  margin-bottom: var(--space-5);
}
```

- [ ] **Step 3: Commit**

```bash
git add artifacts/moodboard/src/index.css
git commit -m "feat(quotes): add quote card + color pill CSS"
```

---

## Task 4: Create QuoteCard component

**Files:**
- Create: `artifacts/moodboard/src/components/QuoteCard.tsx`

- [ ] **Step 1: Create the component**

Create `artifacts/moodboard/src/components/QuoteCard.tsx`:

```tsx
import type { MoodboardItem } from "@/types";

interface QuoteCardProps {
  item: MoodboardItem;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
}

function EditIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

export function QuoteCard({ item, onRemove, onEdit }: QuoteCardProps) {
  const meta: Record<string, string> = (() => {
    try { return item.meta ? JSON.parse(item.meta) : {}; }
    catch { return {}; }
  })();

  const color = meta.color ?? "sage";

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(item.id);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(item.id);
  };

  return (
    <div className={`quote-card quote-card--${color}`}>
      <p className="quote-card-text">{item.title}</p>
      {item.subtitle && <p className="quote-card-author">{item.subtitle}</p>}

      <button className="discover-edit-btn" onClick={handleEdit} aria-label="Edit quote">
        <EditIcon />
      </button>

      <button className="card-remove" onClick={handleRemove} aria-label="Remove quote">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd artifacts/moodboard && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add artifacts/moodboard/src/components/QuoteCard.tsx
git commit -m "feat(quotes): add QuoteCard component"
```

---

## Task 5: Create AddQuoteModal component

**Files:**
- Create: `artifacts/moodboard/src/components/AddQuoteModal.tsx`

- [ ] **Step 1: Create the component**

Create `artifacts/moodboard/src/components/AddQuoteModal.tsx`:

```tsx
import { useState, useRef, useEffect } from "react";
import type { MoodboardItem } from "@/types";

const QUOTE_COLORS = ["sage", "blush", "lavender", "peach", "sky", "slate"] as const;
type QuoteColor = typeof QUOTE_COLORS[number];

interface AddQuoteModalProps {
  onClose: () => void;
  onAdd: (item: MoodboardItem) => void;
}

export function AddQuoteModal({ onClose, onAdd }: AddQuoteModalProps) {
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  const [color, setColor] = useState<QuoteColor>("sage");
  const overlayRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const item: MoodboardItem = {
      id: crypto.randomUUID(),
      type: "quote",
      url: "quote://local",
      title: text.trim(),
      subtitle: author.trim() || undefined,
      meta: JSON.stringify({ color }),
      board: "quotes",
      addedAt: new Date().toISOString(),
    };
    onAdd(item);
    onClose();
  };

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="modal-drawer">
        <div className="modal-handle" />
        <p className="modal-label">Add a quote</p>

        <form onSubmit={handleSubmit}>
          <div className="modal-field">
            <textarea
              ref={textareaRef}
              className="modal-textarea"
              rows={4}
              placeholder="Type or paste a quote…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          <div className="modal-field">
            <p className="modal-label">Author (optional)</p>
            <input
              type="text"
              className="modal-input"
              placeholder="e.g. Marcus Aurelius"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </div>

          <div className="modal-field">
            <p className="modal-label">Color</p>
            <div className="quote-color-pills">
              {QUOTE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`quote-color-pill quote-color-pill--${c}${color === c ? " selected" : ""}`}
                  onClick={() => setColor(c)}
                >
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="submit"
              className="modal-btn-primary"
              disabled={!text.trim()}
            >
              Save quote
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd artifacts/moodboard && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add artifacts/moodboard/src/components/AddQuoteModal.tsx
git commit -m "feat(quotes): add AddQuoteModal component"
```

---

## Task 6: Create EditQuoteModal component

**Files:**
- Create: `artifacts/moodboard/src/components/EditQuoteModal.tsx`

- [ ] **Step 1: Create the component**

Create `artifacts/moodboard/src/components/EditQuoteModal.tsx`:

```tsx
import { useState, useRef } from "react";
import type { MoodboardItem } from "@/types";

const QUOTE_COLORS = ["sage", "blush", "lavender", "peach", "sky", "slate"] as const;
type QuoteColor = typeof QUOTE_COLORS[number];

interface EditQuoteModalProps {
  item: MoodboardItem;
  onClose: () => void;
  onSave: (updates: { title: string; subtitle: string | null; meta: string }) => void;
}

export function EditQuoteModal({ item, onClose, onSave }: EditQuoteModalProps) {
  const initialMeta = (() => {
    try { return item.meta ? JSON.parse(item.meta) : {}; }
    catch { return {}; }
  })();

  const [text, setText] = useState(item.title ?? "");
  const [author, setAuthor] = useState(item.subtitle ?? "");
  const [color, setColor] = useState<QuoteColor>((initialMeta.color as QuoteColor) ?? "sage");
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSave({
      title: text.trim(),
      subtitle: author.trim() || null,
      meta: JSON.stringify({ color }),
    });
    onClose();
  };

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="modal-drawer">
        <div className="modal-handle" />
        <p className="modal-label">Edit quote</p>

        <form onSubmit={handleSubmit}>
          <div className="modal-field">
            <textarea
              className="modal-textarea"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
          </div>

          <div className="modal-field">
            <p className="modal-label">Author (optional)</p>
            <input
              type="text"
              className="modal-input"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </div>

          <div className="modal-field">
            <p className="modal-label">Color</p>
            <div className="quote-color-pills">
              {QUOTE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`quote-color-pill quote-color-pill--${c}${color === c ? " selected" : ""}`}
                  onClick={() => setColor(c)}
                >
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="submit"
              className="modal-btn-primary"
              disabled={!text.trim()}
            >
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd artifacts/moodboard && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add artifacts/moodboard/src/components/EditQuoteModal.tsx
git commit -m "feat(quotes): add EditQuoteModal component"
```

---

## Task 7: Create the Quotes page

**Files:**
- Create: `artifacts/moodboard/src/pages/quotes.tsx`

- [ ] **Step 1: Create the page**

Create `artifacts/moodboard/src/pages/quotes.tsx`:

```tsx
import { useState, useCallback, useEffect } from "react";
import type { MoodboardItem } from "@/types";
import { fetchItems, createItem, deleteItem, patchItemEdit } from "@/lib/api";
import { QuoteCard } from "@/components/QuoteCard";
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

function matchesSearch(item: MoodboardItem, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  return [item.title ?? "", item.subtitle ?? ""].some((f) =>
    f.toLowerCase().includes(q),
  );
}

interface QuotesProps {
  searchQuery: string;
}

export default function Quotes({ searchQuery }: QuotesProps) {
  const [items, setItems] = useState<MoodboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<MoodboardItem | null>(null);

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

  const displayed = items.filter((item) => matchesSearch(item, searchQuery));

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
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd artifacts/moodboard && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add artifacts/moodboard/src/pages/quotes.tsx
git commit -m "feat(quotes): add Quotes page"
```

---

## Task 8: Wire the Quotes tab into moodboard.tsx

**Files:**
- Modify: `artifacts/moodboard/src/pages/moodboard.tsx`

- [ ] **Step 1: Add the Quotes import**

At the top of `artifacts/moodboard/src/pages/moodboard.tsx`, after the existing `Discover` import, add:

```ts
import Quotes from "@/pages/quotes";
```

- [ ] **Step 2: Extend the activeTab type**

Find this line in `moodboard.tsx`:

```ts
const [activeTab, setActiveTab] = useState<"board" | "discover">("board");
```

Change it to:

```ts
const [activeTab, setActiveTab] = useState<"board" | "discover" | "quotes">("board");
```

- [ ] **Step 3: Add the Quotes tab button in the topbar**

Find the tab switcher section in the JSX. It currently contains two `<button>` elements for Board and Discover:

```tsx
<button
  className={`tab-btn ${activeTab === "board" ? "active" : ""}`}
  onClick={() => setActiveTab("board")}
>
  Board
</button>
<button
  className={`tab-btn ${activeTab === "discover" ? "active" : ""}`}
  onClick={() => setActiveTab("discover")}
>
  Discover
</button>
```

Add a third button immediately after:

```tsx
<button
  className={`tab-btn ${activeTab === "quotes" ? "active" : ""}`}
  onClick={() => setActiveTab("quotes")}
>
  Quotes
</button>
```

- [ ] **Step 4: Show board-only controls only when on Board tab**

The `{activeTab === "board" && (...)}` guards already exist for "Reset view", "item count", and "Surprise Me". No change needed there — they naturally hide on Quotes.

- [ ] **Step 5: Add the Quotes page conditional render**

Find the existing Discover conditional render at the bottom of the JSX:

```tsx
{/* Discover page — manages its own FAB and modal */}
{activeTab === "discover" && (
  <Discover searchQuery={searchQuery} />
)}
```

Add the Quotes render immediately after:

```tsx
{/* Quotes page — manages its own FAB and modal */}
{activeTab === "quotes" && (
  <Quotes searchQuery={searchQuery} />
)}
```

- [ ] **Step 6: Typecheck**

```bash
cd artifacts/moodboard && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add artifacts/moodboard/src/pages/moodboard.tsx
git commit -m "feat(quotes): wire Quotes tab into app shell"
```

---

## Task 9: Manual verification

- [ ] **Step 1: Start the app and open in browser**

Follow the project's normal dev startup (run the API server and the Vite frontend dev server as per the project's existing setup).

- [ ] **Step 2: Verify the Quotes tab appears**

Click "Quotes" in the topbar. The page should load with the empty state: "No quotes yet — Save a line that stuck with you."

- [ ] **Step 3: Add a quote**

Click the FAB (+). The drawer modal should slide up with:
- A textarea for the quote
- An optional author field
- Six color pills (Sage, Blush, Lavender, Peach, Sky, Slate) with Sage pre-selected

Type a quote, set an author, pick a color, click "Save quote". The modal closes and the card appears in the masonry grid with the chosen pastel background.

- [ ] **Step 4: Verify card renders correctly**

The card should show:
- Pastel background matching the chosen color
- Quote text in Instrument Serif italic
- Author line in smaller DM Sans below (if provided)
- Edit and remove buttons appear on hover

- [ ] **Step 5: Edit a quote**

Hover the card and click the edit (pencil) button. The edit modal should open pre-filled with the quote text, author, and current color selected. Change the color, click "Save changes". Card should update immediately.

- [ ] **Step 6: Remove a quote**

Hover the card and click ×. The card should disappear from the grid.

- [ ] **Step 7: Verify search works**

Type text in the topbar search that matches the quote or author. Only matching cards should appear. Clear search — all cards return.

- [ ] **Step 8: Verify Board and Discover tabs still work**

Switch to Board and Discover tabs. Confirm no regressions: existing items, pan/zoom, modals all function as before.

- [ ] **Step 9: Verify dark mode**

Toggle dark mode. Quote cards should switch to darker tinted backgrounds with light text.
