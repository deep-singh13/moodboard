# Discover Section — Design Spec
**Date:** 2026-05-06
**Status:** Approved

---

## Overview

A new "Discover" tab alongside the existing moodboard. It is a scrollable masonry grid for collecting movie recommendations, Instagram reels, and website links. It shares the existing database table and API infrastructure — the only additions are a `board` discriminator column, a `meta` column, a movie-search proxy endpoint, and three new frontend files.

---

## Navigation

- The topbar gains a pill-shaped **`Board | Discover`** tab switcher, rendered as a single component inside the existing `moodboard.tsx` topbar.
- Switching tabs is **instant and client-side** — no route change, no page reload.
- The moodboard canvas retains its full pan/zoom state across tab switches (refs stay mounted, canvas is conditionally hidden with CSS `display:none`, not unmounted).
- The existing `⌘K` search input searches whichever tab is active. On the Board tab it searches `board=moodboard` items; on the Discover tab it searches `board=discover` items. No separate search UI needed.

---

## Layout

- **Masonry CSS columns** (`columns: 4`, `column-gap: 14px`), not an infinite canvas.
- The page is a **normal scrollable div**, not panned/zoomed.
- Card aspect ratios by type:
  - **Movie** — `2:3` (tall poster)
  - **Reel** — `9:16` (portrait)
  - **Link** — `16:9` (landscape)
- **Filter chips** sit above the grid: All · Movies · Reels · Links · Want to watch · Watched. Filtering is client-side only — no additional API calls. Filters compose (e.g. "Movies + Want to watch" simultaneously).

---

## Data Model

### Database migrations (run on server startup via `initDb()`)

```sql
ALTER TABLE items ADD COLUMN IF NOT EXISTS board TEXT NOT NULL DEFAULT 'moodboard';
ALTER TABLE items ADD COLUMN IF NOT EXISTS meta  TEXT;
```

- `board` defaults to `'moodboard'` — every existing row is unaffected.
- `meta` stores a JSON string with type-specific extras. Never queried server-side; parsed on the frontend only.

### Item field mapping

| Field | Movie | Reel | Link |
|---|---|---|---|
| `type` | `movie` | `reel` | `link` |
| `board` | `discover` | `discover` | `discover` |
| `title` | "Interstellar" | "@username" | OG title |
| `subtitle` | "2014 · Sci-Fi" | "Instagram" | domain |
| `image_url` | OMDB poster URL | uploaded thumbnail (base64 via `image_data`) | OG image URL |
| `meta` | `{"year":2014,"rating":8.7,"genre":"Sci-Fi","director":"Christopher Nolan"}` | `{"username":"@user","reel_url":"https://..."}` | — |
| `completed` | `true` = Watched | `true` = Seen | `true` = Visited |

### TypeScript type changes (`src/types/index.ts`)

```ts
export interface MoodboardItem {
  // existing fields unchanged …
  board?: string;   // 'moodboard' | 'discover' — undefined treated as 'moodboard'
  meta?: string;    // JSON string, type-specific extras
}
```

---

## Backend Changes

### Modified: `src/lib/db.ts`
Add two `ALTER TABLE` statements to `initDb()`:
```ts
await pool.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS board TEXT NOT NULL DEFAULT 'moodboard'`);
await pool.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS meta TEXT`);
```

### Modified: `src/routes/items.ts`
- `rowToItem` maps `row.board` and `row.meta`.
- `GET /api/items` reads optional `?board=` query param, defaults to `'moodboard'`. SQL becomes `WHERE board = $1`.
- `POST /api/items` reads `board` and `meta` from body, includes them in the `INSERT`.
- `PATCH /api/items/:id` already supports arbitrary field patching — no changes needed.

### New: `src/routes/movieSearch.ts`
```
GET /api/movie-search?q=<title>
```
- Proxies to **OMDB API** (`http://www.omdbapi.com/?apikey=<key>&s=<q>&type=movie`).
- Free tier: 1,000 requests/day, no credit card required.
- Returns up to 5 results: `[{ title, year, genre, rating, posterUrl, imdbId }]`.
- `OMDB_API_KEY` added to server environment variables.
- Returns `[]` gracefully on network error or API quota exceeded — the frontend falls back to manual entry.

### Modified: `src/routes/index.ts`
Register the new `movieSearch` router at `/api/movie-search`.

---

## Frontend Changes

### New: `src/pages/discover.tsx`
- Fetches `GET /api/items?board=discover` on mount.
- Manages local item state: add, remove, toggle-complete, update-note (same pattern as `moodboard.tsx`).
- Renders filter chips (client-side), masonry grid of `<DiscoverCard>` components, and the `<AddDiscoverModal>`.
- Receives `searchQuery` as a prop from `moodboard.tsx` (the parent that owns the shared topbar search input).

### New: `src/components/DiscoverCard.tsx`
- Props: `item`, `onRemove`, `onToggleComplete`, `onUpdateNote`, `isHighlighted`.
- Renders image at the correct aspect ratio for the item's type.
- **Status badge** top-left: "Want to watch" (amber) when `!completed`; "Watched ✓" / "Seen ✓" / "Visited ✓" (green) when `completed`. Label text varies by type.
- **Check button** bottom-right: same toggle-complete behaviour and animation as `MoodboardCard`.
- **Remove button** top-right: appears on hover.
- **Note dot + pencil** bottom-left: identical to `MoodboardCard` — reuses the same CSS classes.
- Completed state: `filter: grayscale(0.55) brightness(0.75)` — identical to existing moodboard completed style.
- Clicking a movie card opens `https://www.imdb.com/title/<imdbId>` (stored in `meta`). Clicking reel/link opens the URL.

### New: `src/components/AddDiscoverModal.tsx`
Three-tab modal: **Movie** (default) · **Reel** · **Link**.

**Movie tab:**
- Text input → 300ms debounce → `GET /api/movie-search?q=` → shows up to 5 results.
- Selecting a result auto-fills: `title`, `subtitle` ("YYYY · Genre"), `imageUrl` (poster), `meta` (year, rating, genre, director, imdbId).
- "Add to Discover" enabled only when a result is selected.

**Reel tab:**
- URL input (required).
- Optional thumbnail upload — uses `compressImage()` (moved from `AddItemModal.tsx` to `src/lib/imageUtils.ts` and exported so both modals can import it), stored as `image_data` (base64). If skipped, card shows a styled placeholder.
- Username extracted from the URL for `title` (`@username`).

**Link tab:**
- URL input → calls existing `GET /api/fetch-og` — identical to the moodboard's add-link flow.

All three tabs share the same "Cancel" / "Add to Discover" button row and the same drawer animation.

### Modified: `src/pages/moodboard.tsx`
- Adds `activeTab` state: `'board' | 'discover'`, default `'board'`.
- Renders the `Board | Discover` tab switcher in the topbar (new `TabSwitcher` sub-component or inline JSX).
- The moodboard canvas wrapper gets `style={{ display: activeTab === 'board' ? 'block' : 'none' }}` — it stays mounted, preserving pan/zoom state.
- `<Discover>` is rendered alongside (also conditionally shown) and receives `searchQuery` as a prop.
- The FAB's `onClick` opens the appropriate modal based on `activeTab`.

### New API function: `src/lib/api.ts`
```ts
export async function fetchMovieSearch(q: string): Promise<MovieResult[]>
// GET /api/movie-search?q=<q>
// Returns [] on error
```

### New type: `src/types/index.ts`
```ts
export interface MovieResult {
  title: string;
  year: string;
  genre: string;
  rating: string;    // e.g. "8.7"
  posterUrl: string;
  imdbId: string;
}
```

---

## UX Behaviour Details

### Tab switching
- Switching is instant. The canvas does **not** unmount — it is hidden with `display: none`.
- `activeTab` is stored in React state in `moodboard.tsx` (not localStorage — no persistence needed).

### Masonry responsive behaviour
- 4 columns on desktop (≥ 1024px)
- 3 columns on tablet (≥ 640px)
- 2 columns on mobile (< 640px)

### Status labels by type
| Type | `completed = false` | `completed = true` |
|---|---|---|
| movie | "Want to watch" | "Watched ✓" |
| reel | "Saved" | "Seen ✓" |
| link | "Saved" | "Visited ✓" |

### OMDB fallback
If OMDB search returns no results or fails, the Movie tab shows an inline message "No results — try a different title" and an empty state. The user cannot add a movie without selecting a result (prevents blank cards).

### Instagram reel placeholder
If no thumbnail is uploaded for a reel, the card renders a styled dark placeholder with a play icon and the username centred, instead of a blank box.

### Search scope
`matchesSearch()` already searches `title`, `subtitle`, and `note`. It is passed the Discover items when on the Discover tab — no changes to the function itself.

---

## Files Changed Summary

| File | Change |
|---|---|
| `artifacts/api-server/src/lib/db.ts` | Add 2 `ALTER TABLE` statements |
| `artifacts/api-server/src/routes/items.ts` | `board`/`meta` in rowToItem, GET filter, POST insert |
| `artifacts/api-server/src/routes/movieSearch.ts` | **New** — OMDB proxy |
| `artifacts/api-server/src/routes/index.ts` | Register movie-search route |
| `artifacts/moodboard/src/types/index.ts` | Add `board?`, `meta?`, `MovieResult` |
| `artifacts/moodboard/src/lib/api.ts` | Add `fetchMovieSearch()` |
| `artifacts/moodboard/src/lib/imageUtils.ts` | **New** — extract `compressImage()` from `AddItemModal` |
| `artifacts/moodboard/src/pages/moodboard.tsx` | Tab switcher, conditional render |
| `artifacts/moodboard/src/pages/discover.tsx` | **New** — Discover page |
| `artifacts/moodboard/src/components/DiscoverCard.tsx` | **New** — card component |
| `artifacts/moodboard/src/components/AddDiscoverModal.tsx` | **New** — add modal |
| `artifacts/moodboard/src/index.css` | Masonry + Discover-specific styles |

---

## Out of Scope

- No sorting (chronological add order is fine for now)
- No pagination (all items loaded at once, same as the moodboard)
- No sharing or public view
- No tags or custom categories beyond the three content types
- No Surprise Me button on Discover (that's a moodboard-specific feature)
