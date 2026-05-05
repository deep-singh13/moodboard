# Discover Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Discover" tab to the moodboard app — a scrollable masonry grid for collecting movies, Instagram reels, and website links, with movie search powered by the OMDB API.

**Architecture:** A `board` discriminator column on the existing `items` table routes records between the moodboard (`board='moodboard'`) and the new Discover section (`board='discover'`). The existing CRUD routes are extended with a `?board=` query param. Three new frontend files (page, card, modal) sit alongside the existing moodboard components. The tab switcher lives in `moodboard.tsx` — switching hides the canvas (but keeps it mounted to preserve pan/zoom state) and conditionally renders the Discover page.

**Tech Stack:** Node/Express/TypeScript (backend), React 19/Vite/TypeScript (frontend), PostgreSQL via `pg` pool, OMDB API (free, 1000 req/day), CSS columns masonry (no library).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `artifacts/api-server/src/lib/db.ts` | Modify | Add `board` + `meta` column migrations |
| `artifacts/api-server/src/routes/items.ts` | Modify | Filter GET by board, include board/meta in POST/rowToItem |
| `artifacts/api-server/src/routes/movieSearch.ts` | Create | OMDB search + detail proxy endpoints |
| `artifacts/api-server/src/routes/index.ts` | Modify | Register movieSearch router |
| `artifacts/moodboard/src/types/index.ts` | Modify | Add `board?`, `meta?` to MoodboardItem; add MovieResult |
| `artifacts/moodboard/src/lib/imageUtils.ts` | Create | Shared `compressImage()` utility |
| `artifacts/moodboard/src/components/AddItemModal.tsx` | Modify | Import `compressImage` from imageUtils instead of defining it |
| `artifacts/moodboard/src/lib/api.ts` | Modify | Add `fetchMovieSearch()` + `fetchMovieDetail()` |
| `artifacts/moodboard/src/index.css` | Modify | Tab switcher, masonry grid, discover card, status badge, filter chips |
| `artifacts/moodboard/src/components/DiscoverCard.tsx` | Create | Masonry card with movie/reel/link variants |
| `artifacts/moodboard/src/components/AddDiscoverModal.tsx` | Create | Three-tab add modal (Movie/Reel/Link) |
| `artifacts/moodboard/src/pages/discover.tsx` | Create | Discover page — masonry grid + filter chips |
| `artifacts/moodboard/src/pages/moodboard.tsx` | Modify | Tab switcher, conditional board/discover render |

---

## Task 1: Get OMDB API key

The movie search feature requires a free OMDB API key (no credit card needed).

- [ ] **Step 1: Register for free OMDB key**

  Open https://www.omdbapi.com/apikey.aspx in your browser.
  Select "FREE! (1,000 daily limit)" and enter your email.
  Check your email and activate the key (it arrives within a minute).
  The key is a short alphanumeric string like `abc12345`.

- [ ] **Step 2: Add key to server environment**

  Open `artifacts/api-server/.env` (create it if it doesn't exist).
  Add this line:
  ```
  OMDB_API_KEY=your_actual_key_here
  ```
  The server already loads `.env` via its existing setup — no config change needed.

- [ ] **Step 3: Verify key works**

  Run this curl (replace `abc12345` with your actual key):
  ```bash
  curl "https://www.omdbapi.com/?apikey=abc12345&s=interstellar&type=movie"
  ```
  Expected: JSON with `"Response":"True"` and a `"Search"` array containing movie objects.

---

## Task 2: DB migrations — add `board` and `meta` columns

The existing `items` table gains two nullable columns. The `board` column defaults to `'moodboard'` so every existing row is automatically unaffected.

**Files:**
- Modify: `artifacts/api-server/src/lib/db.ts`

- [ ] **Step 1: Add the two ALTER TABLE statements to `initDb()`**

  Open `artifacts/api-server/src/lib/db.ts`. The file currently has one `ALTER TABLE` at the bottom of `initDb()` for the `note` column. Add two more directly after it:

  ```ts
  export async function initDb(): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS items (
        id          TEXT        PRIMARY KEY,
        type        TEXT        NOT NULL,
        url         TEXT,
        title       TEXT,
        subtitle    TEXT,
        image_url   TEXT,
        size        TEXT        NOT NULL,
        position_x  REAL        NOT NULL DEFAULT 0,
        position_y  REAL        NOT NULL DEFAULT 0,
        added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        image_data  TEXT,
        completed   BOOLEAN     NOT NULL DEFAULT false
      )
    `);
    await pool.query(`
      ALTER TABLE items ADD COLUMN IF NOT EXISTS note TEXT
    `);
    await pool.query(`
      ALTER TABLE items ADD COLUMN IF NOT EXISTS board TEXT NOT NULL DEFAULT 'moodboard'
    `);
    await pool.query(`
      ALTER TABLE items ADD COLUMN IF NOT EXISTS meta TEXT
    `);
  }
  ```

- [ ] **Step 2: Restart the server and verify columns exist**

  The server auto-calls `initDb()` on startup. Restart it (or push to Render — it restarts automatically on deploy). Then run:
  ```bash
  curl https://moodboard-zyji.onrender.com/api/items
  ```
  Expected: existing items return as before. No errors. The `board` and `meta` fields will appear once we update `rowToItem` in the next task.

- [ ] **Step 3: Commit**

  ```bash
  cd "artifacts/api-server"
  git add src/lib/db.ts
  git commit -m "feat: add board and meta columns to items table"
  ```

---

## Task 3: Update items routes — board filter + meta support

`GET /api/items` gains a `?board=` param. `POST /api/items` persists `board` and `meta`. `rowToItem` maps the two new columns. The image storage logic is generalised from `isPhoto` to `isDataUrl` so reel thumbnail uploads (also base64) are handled correctly.

**Files:**
- Modify: `artifacts/api-server/src/routes/items.ts`

- [ ] **Step 1: Replace the entire file content**

  ```ts
  import { Router, type IRouter } from "express";
  import { pool } from "../lib/db";

  const router: IRouter = Router();

  function rowToItem(row: Record<string, unknown>) {
    return {
      id: row.id,
      type: row.type,
      url: row.url ?? undefined,
      title: row.title ?? undefined,
      subtitle: row.subtitle ?? undefined,
      imageUrl:
        (row.image_url as string | null) ??
        (row.image_data as string | null) ??
        undefined,
      size: row.size ? Number(row.size) : undefined,
      addedAt: row.added_at,
      completed: row.completed ?? false,
      note: (row.note as string | null) ?? undefined,
      board: (row.board as string | null) ?? "moodboard",
      meta: (row.meta as string | null) ?? undefined,
    };
  }

  router.get("/items", async (req, res) => {
    const board = (req.query.board as string | undefined) ?? "moodboard";
    try {
      const result = await pool.query(
        "SELECT * FROM items WHERE board = $1 ORDER BY added_at ASC",
        [board],
      );
      res.json(result.rows.map(rowToItem));
    } catch {
      res.status(500).json({ error: "Failed to fetch items" });
    }
  });

  router.post("/items", async (req, res) => {
    const body = req.body as Record<string, string | null | undefined>;
    const { id, type, url, title, subtitle, imageUrl, size, addedAt, board, meta } =
      body;
    const note = (body.note as string | null | undefined) ?? null;

    // Photos and reel thumbnails both arrive as base64 data URLs — store in image_data
    const isDataUrl = (imageUrl ?? "").startsWith("data:");
    const imageUrlDb = isDataUrl ? null : (imageUrl ?? null);
    const imageDataDb = isDataUrl ? (imageUrl ?? null) : null;

    try {
      const result = await pool.query(
        `INSERT INTO items
           (id, type, url, title, subtitle, image_url, size,
            position_x, position_y, added_at, image_data, note, board, meta)
         VALUES ($1,$2,$3,$4,$5,$6,$7, 0,0,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          id,
          type,
          url ?? null,
          title ?? null,
          subtitle ?? null,
          imageUrlDb,
          String(size ?? 320),
          addedAt ?? new Date().toISOString(),
          imageDataDb,
          note,
          board ?? "moodboard",
          meta ?? null,
        ],
      );
      res.json(rowToItem(result.rows[0]));
    } catch {
      res.status(500).json({ error: "Failed to create item" });
    }
  });

  router.delete("/items/:id", async (req, res) => {
    try {
      await pool.query("DELETE FROM items WHERE id = $1", [req.params.id]);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to delete item" });
    }
  });

  router.patch("/items/:id", async (req, res) => {
    const body = req.body as { completed?: boolean; note?: string | null };
    try {
      if (body.completed !== undefined) {
        await pool.query("UPDATE items SET completed = $1 WHERE id = $2", [
          body.completed,
          req.params.id,
        ]);
      }
      if ("note" in body) {
        await pool.query("UPDATE items SET note = $1 WHERE id = $2", [
          body.note ?? null,
          req.params.id,
        ]);
      }
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to update item" });
    }
  });

  export default router;
  ```

- [ ] **Step 2: Verify board filtering works**

  Deploy the server (git push triggers Render deploy). Then:
  ```bash
  # Existing moodboard items still load
  curl "https://moodboard-zyji.onrender.com/api/items"
  # Expected: array of your existing items, each now has "board":"moodboard"

  # Discover board is empty (no items yet)
  curl "https://moodboard-zyji.onrender.com/api/items?board=discover"
  # Expected: []
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add artifacts/api-server/src/routes/items.ts
  git commit -m "feat: filter items by board, persist board/meta on POST"
  ```

---

## Task 4: New movieSearch route — OMDB proxy

Two endpoints: search (fast, returns list) and detail (fetches full metadata for a single selected movie). Both return `[]` / `{}` gracefully on any error so the frontend degrades cleanly.

**Files:**
- Create: `artifacts/api-server/src/routes/movieSearch.ts`

- [ ] **Step 1: Create the file**

  ```ts
  import { Router, type IRouter } from "express";

  const router: IRouter = Router();

  interface OmdbSearchItem {
    Title: string;
    Year: string;
    imdbID: string;
    Poster: string;
  }

  interface OmdbSearchResponse {
    Search?: OmdbSearchItem[];
    Response: string;
  }

  interface OmdbDetailResponse {
    Title?: string;
    Year?: string;
    Genre?: string;
    imdbRating?: string;
    Poster?: string;
    imdbID?: string;
    Director?: string;
    Response: string;
  }

  // GET /api/movie-search?q=<title>
  // Returns up to 5 basic results (title, year, poster, imdbId)
  router.get("/movie-search", async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    if (!q) {
      res.json([]);
      return;
    }

    const apiKey = process.env.OMDB_API_KEY;
    if (!apiKey) {
      res.json([]);
      return;
    }

    try {
      const url = `https://www.omdbapi.com/?apikey=${apiKey}&s=${encodeURIComponent(q)}&type=movie`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) { res.json([]); return; }

      const data = (await response.json()) as OmdbSearchResponse;
      if (data.Response !== "True" || !data.Search) { res.json([]); return; }

      res.json(
        data.Search.slice(0, 5).map((item) => ({
          title: item.Title,
          year: item.Year,
          posterUrl: item.Poster !== "N/A" ? item.Poster : "",
          imdbId: item.imdbID,
        })),
      );
    } catch {
      res.json([]);
    }
  });

  // GET /api/movie-detail/:imdbId
  // Returns full metadata for a single movie (genre, rating, director)
  router.get("/movie-detail/:imdbId", async (req, res) => {
    const apiKey = process.env.OMDB_API_KEY;
    if (!apiKey) { res.json({}); return; }

    try {
      const url = `https://www.omdbapi.com/?apikey=${apiKey}&i=${req.params.imdbId}&type=movie`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) { res.json({}); return; }

      const data = (await response.json()) as OmdbDetailResponse;
      if (data.Response !== "True") { res.json({}); return; }

      res.json({
        title: data.Title ?? "",
        year: data.Year ?? "",
        genre: data.Genre?.split(",")[0]?.trim() ?? "",
        rating: data.imdbRating ?? "",
        posterUrl: data.Poster !== "N/A" ? (data.Poster ?? "") : "",
        imdbId: data.imdbID ?? "",
        director: data.Director ?? "",
      });
    } catch {
      res.json({});
    }
  });

  export default router;
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add artifacts/api-server/src/routes/movieSearch.ts
  git commit -m "feat: add OMDB movie-search and movie-detail proxy routes"
  ```

---

## Task 5: Register movieSearch router

**Files:**
- Modify: `artifacts/api-server/src/routes/index.ts`

- [ ] **Step 1: Add the import and `router.use()` call**

  Replace the entire file:
  ```ts
  import { Router, type IRouter } from "express";
  import healthRouter from "./health";
  import itemsRouter from "./items";
  import fetchOgRouter from "./fetchOg";
  import movieSearchRouter from "./movieSearch";

  const router: IRouter = Router();

  router.use(healthRouter);
  router.use(itemsRouter);
  router.use(fetchOgRouter);
  router.use(movieSearchRouter);

  export default router;
  ```

- [ ] **Step 2: Deploy and verify both endpoints**

  Push to trigger Render deploy, then:
  ```bash
  # Search endpoint
  curl "https://moodboard-zyji.onrender.com/api/movie-search?q=interstellar"
  # Expected: array of up to 5 objects with title, year, posterUrl, imdbId

  # Detail endpoint (use an imdbId from the search results above)
  curl "https://moodboard-zyji.onrender.com/api/movie-detail/tt0816692"
  # Expected: { title:"Interstellar", year:"2014", genre:"Adventure",
  #             rating:"8.7", posterUrl:"https://...", imdbId:"tt0816692",
  #             director:"Christopher Nolan" }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add artifacts/api-server/src/routes/index.ts
  git commit -m "feat: register movie-search and movie-detail routes"
  ```

---

## Task 6: Update TypeScript types

**Files:**
- Modify: `artifacts/moodboard/src/types/index.ts`

- [ ] **Step 1: Replace the file**

  ```ts
  export interface MoodboardItem {
    id: string;
    type: "substack" | "youtube" | "link" | "photo" | "movie" | "reel";
    url: string;
    title?: string;
    subtitle?: string;
    imageUrl?: string;
    size?: number;
    gridX?: number;
    gridY?: number;
    addedAt: string;
    completed?: boolean;
    note?: string;
    board?: string;  // 'moodboard' | 'discover' — undefined means 'moodboard'
    meta?: string;   // JSON string; type-specific extras, parsed by consumers
  }

  export interface MovieResult {
    title: string;
    year: string;
    posterUrl: string;
    imdbId: string;
    // Present only from /api/movie-detail — absent from /api/movie-search results
    genre?: string;
    rating?: string;
    director?: string;
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add artifacts/moodboard/src/types/index.ts
  git commit -m "feat: add board/meta to MoodboardItem, add MovieResult type"
  ```

---

## Task 7: Extract `compressImage` to shared utility

`compressImage` currently lives as a private function inside `AddItemModal.tsx`. `AddDiscoverModal` needs it too — move it to a shared file.

**Files:**
- Create: `artifacts/moodboard/src/lib/imageUtils.ts`
- Modify: `artifacts/moodboard/src/components/AddItemModal.tsx`

- [ ] **Step 1: Create `imageUtils.ts`**

  ```ts
  /**
   * Compress an image File to a JPEG data URL.
   * maxWidth defaults to 1200px; quality defaults to 0.8.
   */
  export function compressImage(
    file: File,
    maxWidth = 1200,
    quality = 0.8,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("No canvas context"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Image load failed"));
      };
      img.src = objectUrl;
    });
  }
  ```

- [ ] **Step 2: Remove the inline `compressImage` from `AddItemModal.tsx` and import it**

  In `artifacts/moodboard/src/components/AddItemModal.tsx`, delete the entire `compressImage` function block (lines 49–79 in the original file) and add this import at the top:

  ```ts
  import { compressImage } from "@/lib/imageUtils";
  ```

  The rest of `AddItemModal.tsx` is unchanged.

- [ ] **Step 3: Verify the moodboard photo upload still works**

  Open the app in your browser, click "+ Add", upload a photo. Confirm it appears on the board as before.

- [ ] **Step 4: Commit**

  ```bash
  git add artifacts/moodboard/src/lib/imageUtils.ts \
          artifacts/moodboard/src/components/AddItemModal.tsx
  git commit -m "refactor: extract compressImage to shared imageUtils"
  ```

---

## Task 8: Add `fetchMovieSearch` and `fetchMovieDetail` to api.ts

**Files:**
- Modify: `artifacts/moodboard/src/lib/api.ts`

- [ ] **Step 1: Append two functions to the end of the file**

  ```ts
  import type { MovieResult } from "@/types";

  export async function fetchMovieSearch(q: string): Promise<MovieResult[]> {
    try {
      const res = await fetch(
        `${BASE}/movie-search?q=${encodeURIComponent(q)}`,
      );
      if (!res.ok) return [];
      return res.json();
    } catch {
      return [];
    }
  }

  export async function fetchMovieDetail(imdbId: string): Promise<MovieResult | null> {
    try {
      const res = await fetch(`${BASE}/movie-detail/${encodeURIComponent(imdbId)}`);
      if (!res.ok) return null;
      const data = await res.json();
      // Empty object means detail fetch failed
      if (!data.title) return null;
      return data as MovieResult;
    } catch {
      return null;
    }
  }
  ```

  Note: `BASE` is already defined as `"/api"` at the top of `api.ts` — do not add it again. The `import type { MovieResult }` line must be added at the top of the file alongside the existing `import type { MoodboardItem }`.

- [ ] **Step 2: Commit**

  ```bash
  git add artifacts/moodboard/src/lib/api.ts
  git commit -m "feat: add fetchMovieSearch and fetchMovieDetail API functions"
  ```

---

## Task 9: Add CSS — tab switcher, masonry grid, discover cards

**Files:**
- Modify: `artifacts/moodboard/src/index.css`

- [ ] **Step 1: Append the following block to the end of `index.css`**

  ```css
  /* ============================================================
     TAB SWITCHER
     ============================================================ */

  .tab-switcher {
    display: flex;
    background: var(--reset-btn-bg);
    border: 1px solid var(--reset-btn-border);
    border-radius: 100px;
    padding: 3px;
    gap: 2px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: var(--card-shadow);
    flex-shrink: 0;
  }

  .tab-btn {
    padding: 5px 14px;
    border-radius: 100px;
    border: none;
    font-family: 'DM Sans', sans-serif;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.18s, color 0.18s;
    background: transparent;
    color: var(--reset-btn-text);
  }

  .tab-btn.active {
    background: var(--bg-btn-add);
    color: #111110;
  }

  /* ============================================================
     DISCOVER PAGE
     ============================================================ */

  .discover-page {
    position: fixed;
    inset: 0;
    overflow-y: auto;
    padding: 80px 24px 100px;
    background-color: var(--bg-canvas);
    background-image: radial-gradient(circle, var(--dot-color) 1px, transparent 1px);
    background-size: 26px 26px;
  }

  .discover-header {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 18px;
  }

  .discover-title {
    font-family: 'Instrument Serif', Georgia, serif;
    font-style: italic;
    font-size: 24px;
    color: var(--text-primary);
    line-height: 1.1;
  }

  .discover-count {
    font-size: 12px;
    color: var(--text-muted);
  }

  /* ── Filter chips ── */

  .discover-filters {
    display: flex;
    gap: 6px;
    margin-bottom: 22px;
    flex-wrap: wrap;
  }

  .filter-chip {
    padding: 5px 13px;
    border-radius: 100px;
    font-family: 'DM Sans', sans-serif;
    font-size: 11px;
    font-weight: 500;
    border: 1px solid var(--reset-btn-border);
    background: var(--reset-btn-bg);
    color: var(--reset-btn-text);
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .filter-chip:hover {
    border-color: var(--border-card-hover);
  }

  .filter-chip.active {
    background: rgba(212, 165, 116, 0.15);
    border-color: rgba(212, 165, 116, 0.45);
    color: var(--bg-btn-add);
  }

  /* ── Masonry grid ── */

  .discover-masonry {
    columns: 4;
    column-gap: 14px;
  }

  @media (max-width: 1023px) {
    .discover-masonry { columns: 3; }
  }

  @media (max-width: 639px) {
    .discover-masonry { columns: 2; }
    .discover-page { padding: 90px 14px 100px; }
  }

  /* ── Discover card ── */

  .discover-card {
    break-inside: avoid;
    margin-bottom: 14px;
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid var(--border-card);
    background: var(--bg-card);
    cursor: pointer;
    position: relative;
    box-shadow: var(--card-shadow);
    transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1),
                box-shadow 0.22s ease,
                border-color 0.22s ease;
  }

  .discover-card:hover {
    transform: translateY(-3px) scale(1.008);
    box-shadow: var(--card-shadow-hover);
    border-color: var(--border-card-hover);
  }

  .discover-card.is-completed {
    filter: grayscale(0.55) brightness(0.75);
    opacity: 0.80;
  }

  .discover-card.is-completed:hover {
    transform: none;
    box-shadow: var(--card-shadow);
  }

  /* Card images — aspect ratio by type */
  .discover-card-img {
    width: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.4s ease;
  }

  .discover-card:hover .discover-card-img {
    transform: scale(1.03);
  }

  .discover-card-img--movie { aspect-ratio: 2 / 3; }
  .discover-card-img--reel  { aspect-ratio: 9 / 16; }
  .discover-card-img--link  { aspect-ratio: 16 / 9; }

  /* Placeholder when no image */
  .discover-card-placeholder {
    width: 100%;
    background: var(--bg-skeleton);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 8px;
    color: var(--text-muted);
    font-size: 11px;
  }

  .discover-card-placeholder--movie { aspect-ratio: 2 / 3; }
  .discover-card-placeholder--reel  { aspect-ratio: 9 / 16; }
  .discover-card-placeholder--link  { aspect-ratio: 16 / 9; }

  /* Card body */
  .discover-card-body {
    padding: 10px 12px 13px;
  }

  .discover-card-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-link);
    line-height: 1.45;
    letter-spacing: -0.01em;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .discover-card-subtitle {
    font-size: 11px;
    color: var(--text-secondary);
    margin-top: 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .discover-type-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    font-weight: 500;
    margin-top: 5px;
    letter-spacing: 0.025em;
    text-transform: uppercase;
  }

  .discover-type-badge--movie { color: var(--bg-btn-add); }
  .discover-type-badge--reel  { color: #A78BFA; }
  .discover-type-badge--link  { color: #6EE7B7; }

  /* Status badge — top left */
  .discover-status-badge {
    position: absolute;
    top: 8px;
    left: 8px;
    padding: 3px 9px;
    border-radius: 100px;
    font-family: 'DM Sans', sans-serif;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.02em;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    border: 1px solid;
    pointer-events: none;
  }

  .discover-status-badge--want {
    background: rgba(212, 165, 116, 0.18);
    border-color: rgba(212, 165, 116, 0.45);
    color: var(--bg-btn-add);
  }

  .discover-status-badge--done {
    background: rgba(76, 175, 80, 0.18);
    border-color: rgba(76, 175, 80, 0.45);
    color: #81C784;
  }

  /* ── Discover empty state ── */

  .discover-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 80px 24px;
  }

  .discover-empty-inner {
    padding: 48px 56px;
    border: 1.5px dashed var(--empty-state-border);
    border-radius: 24px;
    text-align: center;
    max-width: 320px;
  }

  .discover-empty-inner .empty-state-headline {
    display: block;
    margin-bottom: 10px;
  }

  .discover-empty-inner p {
    font-size: 14px;
    color: var(--text-muted);
    line-height: 1.7;
  }

  /* ── Add Discover Modal — type tabs ── */

  .modal-type-tabs {
    display: flex;
    gap: 6px;
    margin-bottom: 16px;
  }

  .modal-type-tab {
    padding: 6px 14px;
    border-radius: 100px;
    font-family: 'DM Sans', sans-serif;
    font-size: 12px;
    font-weight: 500;
    border: 1px solid var(--border-input);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }

  .modal-type-tab.active {
    background: rgba(212, 165, 116, 0.15);
    border-color: rgba(212, 165, 116, 0.45);
    color: var(--bg-btn-add);
  }

  /* Movie search results list */
  .movie-results {
    display: flex;
    flex-direction: column;
    gap: 7px;
    margin-bottom: 14px;
    max-height: 220px;
    overflow-y: auto;
  }

  .movie-result {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border: 1px solid var(--border-input);
    border-radius: 10px;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }

  .movie-result:hover {
    border-color: var(--bg-btn-add);
  }

  .movie-result.selected {
    border-color: var(--bg-btn-add);
    background: rgba(212, 165, 116, 0.08);
  }

  .movie-result-poster {
    width: 36px;
    height: 54px;
    border-radius: 5px;
    object-fit: cover;
    background: var(--bg-skeleton);
    flex-shrink: 0;
  }

  .movie-result-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    line-height: 1.3;
  }

  .movie-result-meta {
    font-size: 11px;
    color: var(--text-secondary);
    margin-top: 2px;
  }

  .movie-no-results {
    font-size: 13px;
    color: var(--text-muted);
    text-align: center;
    padding: 16px 0;
  }

  .modal-upload-btn {
    width: 100%;
    padding: 10px 16px;
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    background: transparent;
    border: 1.5px dashed var(--border-input);
    border-radius: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    margin-bottom: 12px;
    transition: border-color 0.15s, background 0.15s;
  }

  .modal-upload-btn:hover {
    border-color: var(--bg-btn-add);
    background: rgba(212, 165, 116, 0.06);
  }

  .modal-upload-btn.has-file {
    border-color: var(--bg-btn-add);
    color: var(--bg-btn-add);
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add artifacts/moodboard/src/index.css
  git commit -m "feat: add tab switcher, masonry grid, and discover card CSS"
  ```

---

## Task 10: DiscoverCard component

**Files:**
- Create: `artifacts/moodboard/src/components/DiscoverCard.tsx`

- [ ] **Step 1: Create the file**

  ```tsx
  import { useState, useRef, useEffect } from "react";
  import type { MoodboardItem } from "@/types";

  interface DiscoverCardProps {
    item: MoodboardItem;
    onRemove: (id: string) => void;
    onToggleComplete: (id: string) => void;
    onUpdateNote?: (id: string, note: string | null) => void;
  }

  function CheckIcon() {
    return (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }

  function PencilIcon() {
    return (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    );
  }

  function getStatusLabel(type: string, completed: boolean): string {
    if (type === "movie") return completed ? "Watched ✓" : "Want to watch";
    if (type === "reel")  return completed ? "Seen ✓"    : "Saved";
    return completed ? "Visited ✓" : "Saved";
  }

  function getTypeBadgeLabel(type: string): string {
    if (type === "movie") return "Movie";
    if (type === "reel")  return "Reel";
    return "Link";
  }

  function getTypeIcon(type: string): React.ReactNode {
    if (type === "movie") {
      return (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="2" width="20" height="20" rx="2" /><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 7h5M17 17h5" />
        </svg>
      );
    }
    if (type === "reel") {
      return (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      );
    }
    return (
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    );
  }

  export function DiscoverCard({ item, onRemove, onToggleComplete, onUpdateNote }: DiscoverCardProps) {
    const [imgError, setImgError] = useState(false);
    const [isEditingNote, setIsEditingNote] = useState(false);
    const [draftNote, setDraftNote] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const completed = !!item.completed;
    const hasNote = !!(item.note?.trim());

    // Parse meta JSON safely
    const meta: Record<string, string> = (() => {
      try { return item.meta ? JSON.parse(item.meta) : {}; }
      catch { return {}; }
    })();

    useEffect(() => {
      if (isEditingNote && textareaRef.current) {
        textareaRef.current.focus();
        const len = textareaRef.current.value.length;
        textareaRef.current.setSelectionRange(len, len);
      }
    }, [isEditingNote]);

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isEditingNote || completed) return;
      if (item.type === "movie" && meta.imdbId) {
        window.open(`https://www.imdb.com/title/${meta.imdbId}`, "_blank", "noopener noreferrer");
      } else {
        window.open(item.url, "_blank", "noopener noreferrer");
      }
    };

    const handleRemove = (e: React.MouseEvent) => {
      e.stopPropagation();
      onRemove(item.id);
    };

    const handleToggle = (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleComplete(item.id);
    };

    const openNoteEdit = (e: React.MouseEvent) => {
      e.stopPropagation();
      setDraftNote(item.note ?? "");
      setIsEditingNote(true);
    };

    const saveNote = () => {
      onUpdateNote?.(item.id, draftNote.trim() || null);
      setIsEditingNote(false);
    };

    const handleNoteKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setIsEditingNote(false); }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveNote(); }
    };

    const completedClass = completed ? "is-completed" : "";
    const typeClass = `discover-card-img--${item.type}`;
    const placeholderClass = `discover-card-placeholder--${item.type}`;

    const image =
      item.imageUrl && !imgError ? (
        <img
          src={item.imageUrl}
          alt={item.title ?? ""}
          className={`discover-card-img ${typeClass}`}
          onError={() => setImgError(true)}
          draggable={false}
        />
      ) : (
        <div className={`discover-card-placeholder ${placeholderClass}`}>
          {item.type === "reel" && (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity={0.3}>
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
          {item.type === "movie" && (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity={0.3}>
              <rect x="2" y="2" width="20" height="20" rx="2" /><path d="M7 2v20M17 2v20M2 12h20" />
            </svg>
          )}
          {item.type === "link" && (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity={0.3}>
              <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
            </svg>
          )}
        </div>
      );

    return (
      <div
        className={`discover-card ${completedClass}`}
        onClick={handleClick}
      >
        {image}

        <div className="discover-card-body">
          {item.title && <p className="discover-card-title">{item.title}</p>}
          {item.subtitle && <p className="discover-card-subtitle">{item.subtitle}</p>}
          <span className={`discover-type-badge discover-type-badge--${item.type}`}>
            {getTypeIcon(item.type)} {getTypeBadgeLabel(item.type)}
          </span>
        </div>

        {/* Status badge top-left */}
        <div className={`discover-status-badge ${completed ? "discover-status-badge--done" : "discover-status-badge--want"}`}>
          {getStatusLabel(item.type, completed)}
        </div>

        {/* Remove button top-right */}
        <button className="card-remove" onClick={handleRemove} aria-label="Remove">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Check button bottom-right */}
        <button
          className={`card-check ${completed ? "card-check--done" : ""}`}
          onClick={handleToggle}
          aria-label={completed ? "Mark incomplete" : "Mark complete"}
        >
          <CheckIcon />
        </button>

        {/* Note dot + pencil button bottom-left */}
        {hasNote && !isEditingNote && <span className="note-dot" />}
        <button className="card-note" onClick={openNoteEdit} aria-label="Edit note">
          <PencilIcon />
        </button>

        {/* Inline note editor */}
        {isEditingNote && (
          <div className="note-edit-area" onClick={(e) => e.stopPropagation()}>
            <textarea
              ref={textareaRef}
              className="note-textarea"
              value={draftNote}
              onChange={(e) => setDraftNote(e.target.value.slice(0, 300))}
              onKeyDown={handleNoteKeyDown}
              onBlur={() => setTimeout(() => setIsEditingNote(false), 150)}
              placeholder="Add a personal note…"
              rows={3}
            />
            <div className="note-edit-footer">
              <span className="note-char-count">{draftNote.length}/300</span>
              <button
                className="note-save-btn"
                onMouseDown={(e) => e.preventDefault()}
                onClick={saveNote}
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add artifacts/moodboard/src/components/DiscoverCard.tsx
  git commit -m "feat: add DiscoverCard component"
  ```

---

## Task 11: AddDiscoverModal component

Three-tab modal: Movie (title search + result selection), Reel (URL + optional thumbnail), Link (URL + OG fetch).

**Files:**
- Create: `artifacts/moodboard/src/components/AddDiscoverModal.tsx`

- [ ] **Step 1: Create the file**

  ```tsx
  import { useState, useRef, useEffect, useCallback } from "react";
  import type { MoodboardItem, MovieResult } from "@/types";
  import { fetchMovieSearch, fetchMovieDetail, fetchOgMeta } from "@/lib/api";
  import { compressImage } from "@/lib/imageUtils";

  interface AddDiscoverModalProps {
    onClose: () => void;
    onAdd: (item: MoodboardItem) => void;
  }

  type TabType = "movie" | "reel" | "link";

  function getDomain(url: string): string {
    try { return new URL(url).hostname.replace("www.", ""); }
    catch { return url; }
  }

  function extractInstagramUsername(url: string): string {
    try {
      const u = new URL(url);
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] === "stories" && parts[1]) return `@${parts[1]}`;
      if (parts[0] && parts[0] !== "reel" && parts[0] !== "p" && parts[0] !== "reels") {
        return `@${parts[0]}`;
      }
      return "Instagram Reel";
    } catch { return "Instagram Reel"; }
  }

  export function AddDiscoverModal({ onClose, onAdd }: AddDiscoverModalProps) {
    const [tab, setTab] = useState<TabType>("movie");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const overlayRef = useRef<HTMLDivElement>(null);

    // Movie tab state
    const [movieQuery, setMovieQuery] = useState("");
    const [movieResults, setMovieResults] = useState<MovieResult[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [selectedMovie, setSelectedMovie] = useState<MovieResult | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Reel tab state
    const [reelUrl, setReelUrl] = useState("");
    const [reelCaption, setReelCaption] = useState("");
    const [reelThumbnail, setReelThumbnail] = useState<string | null>(null);
    const reelFileRef = useRef<HTMLInputElement>(null);

    // Link tab state
    const [linkUrl, setLinkUrl] = useState("");

    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => { inputRef.current?.focus(); }, []);

    // Debounced movie search
    const handleMovieQueryChange = useCallback((q: string) => {
      setMovieQuery(q);
      setSelectedMovie(null);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (!q.trim()) { setMovieResults([]); return; }
      searchTimerRef.current = setTimeout(async () => {
        setSearchLoading(true);
        const results = await fetchMovieSearch(q.trim());
        setMovieResults(results);
        setSearchLoading(false);
      }, 300);
    }, []);

    const handleSelectMovie = async (result: MovieResult) => {
      setSelectedMovie(result);
      // Fetch full details to get genre, rating, director
      setDetailLoading(true);
      const detail = await fetchMovieDetail(result.imdbId);
      if (detail) setSelectedMovie(detail);
      setDetailLoading(false);
    };

    const handleReelThumbnail = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await compressImage(file, 800, 0.82);
        setReelThumbnail(dataUrl);
      } catch {
        setError("Couldn't process that image.");
      }
    };

    const handleAdd = async () => {
      setError(null);
      setLoading(true);

      try {
        let item: MoodboardItem;

        if (tab === "movie") {
          if (!selectedMovie) return;
          const meta = JSON.stringify({
            year: selectedMovie.year ?? "",
            genre: selectedMovie.genre ?? "",
            rating: selectedMovie.rating ?? "",
            director: selectedMovie.director ?? "",
            imdbId: selectedMovie.imdbId,
          });
          item = {
            id: crypto.randomUUID(),
            type: "movie",
            board: "discover",
            url: `https://www.imdb.com/title/${selectedMovie.imdbId}`,
            title: selectedMovie.title,
            subtitle: [selectedMovie.year, selectedMovie.genre].filter(Boolean).join(" · "),
            imageUrl: selectedMovie.posterUrl || undefined,
            meta,
            size: 320,
            addedAt: new Date().toISOString(),
          };
        } else if (tab === "reel") {
          let url = reelUrl.trim();
          if (!url) { setError("Please enter a URL."); setLoading(false); return; }
          if (!/^https?:\/\//i.test(url)) url = "https://" + url;
          const username = reelCaption.trim() || extractInstagramUsername(url);
          item = {
            id: crypto.randomUUID(),
            type: "reel",
            board: "discover",
            url,
            title: username,
            subtitle: "Instagram",
            imageUrl: reelThumbnail || undefined,
            meta: JSON.stringify({ username, reel_url: url }),
            size: 320,
            addedAt: new Date().toISOString(),
          };
        } else {
          // Link
          let url = linkUrl.trim();
          if (!url) { setError("Please enter a URL."); setLoading(false); return; }
          if (!/^https?:\/\//i.test(url)) url = "https://" + url;
          const og = await fetchOgMeta(url);
          const domain = getDomain(url);
          item = {
            id: crypto.randomUUID(),
            type: "link",
            board: "discover",
            url,
            title: og.title ?? domain,
            subtitle: domain,
            imageUrl: og.image,
            size: 320,
            addedAt: new Date().toISOString(),
          };
        }

        onAdd(item);
        onClose();
      } catch {
        setError("Something went wrong — please try again.");
      } finally {
        setLoading(false);
      }
    };

    const canAdd =
      !loading &&
      (tab === "movie" ? !!selectedMovie && !detailLoading :
       tab === "reel"  ? !!reelUrl.trim() :
       !!linkUrl.trim());

    return (
      <div
        className="modal-overlay"
        ref={overlayRef}
        onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      >
        <div className="modal-drawer">
          <div className="modal-handle" />
          <p className="modal-label">Add to Discover</p>

          {/* Tab switcher */}
          <div className="modal-type-tabs">
            {(["movie", "reel", "link"] as TabType[]).map((t) => (
              <button
                key={t}
                className={`modal-type-tab ${tab === t ? "active" : ""}`}
                onClick={() => { setTab(t); setError(null); }}
              >
                {t === "movie" ? "🎬 Movie" : t === "reel" ? "▶ Reel" : "🔗 Link"}
              </button>
            ))}
          </div>

          {/* Movie tab */}
          {tab === "movie" && (
            <>
              <input
                ref={inputRef}
                className="modal-input"
                placeholder="Search for a movie title…"
                value={movieQuery}
                onChange={(e) => handleMovieQueryChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canAdd) handleAdd(); }}
              />
              {searchLoading && (
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
                  Searching…
                </p>
              )}
              {!searchLoading && movieQuery && movieResults.length === 0 && (
                <p className="movie-no-results">No results — try a different title</p>
              )}
              {movieResults.length > 0 && (
                <div className="movie-results">
                  {movieResults.map((r) => (
                    <div
                      key={r.imdbId}
                      className={`movie-result ${selectedMovie?.imdbId === r.imdbId ? "selected" : ""}`}
                      onClick={() => handleSelectMovie(r)}
                    >
                      {r.posterUrl ? (
                        <img src={r.posterUrl} alt={r.title} className="movie-result-poster" />
                      ) : (
                        <div className="movie-result-poster" />
                      )}
                      <div>
                        <div className="movie-result-title">{r.title}</div>
                        <div className="movie-result-meta">
                          {detailLoading && selectedMovie?.imdbId === r.imdbId
                            ? "Loading details…"
                            : [r.year, selectedMovie?.imdbId === r.imdbId ? selectedMovie.genre : ""]
                                .filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Reel tab */}
          {tab === "reel" && (
            <>
              <input
                ref={tab === "reel" ? inputRef : undefined}
                className="modal-input"
                type="url"
                placeholder="Paste Instagram reel URL…"
                value={reelUrl}
                onChange={(e) => setReelUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canAdd) handleAdd(); }}
              />
              <input
                className="modal-input"
                placeholder="Caption or @username (optional)"
                value={reelCaption}
                onChange={(e) => setReelCaption(e.target.value)}
              />
              <button
                className={`modal-upload-btn ${reelThumbnail ? "has-file" : ""}`}
                onClick={() => reelFileRef.current?.click()}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
                {reelThumbnail ? "Thumbnail uploaded ✓" : "Upload thumbnail (optional)"}
              </button>
              <input
                ref={reelFileRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleReelThumbnail}
              />
            </>
          )}

          {/* Link tab */}
          {tab === "link" && (
            <input
              ref={tab === "link" ? inputRef : undefined}
              className="modal-input"
              type="url"
              placeholder="Paste any website URL…"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && canAdd) handleAdd(); }}
            />
          )}

          {error && <p className="modal-error">{error}</p>}

          <div className="modal-actions">
            <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
            <button
              className="modal-btn-primary"
              onClick={handleAdd}
              disabled={!canAdd}
            >
              {loading ? "Adding…" : "Add to Discover"}
            </button>
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add artifacts/moodboard/src/components/AddDiscoverModal.tsx
  git commit -m "feat: add AddDiscoverModal with movie/reel/link tabs"
  ```

---

## Task 12: Discover page

**Files:**
- Create: `artifacts/moodboard/src/pages/discover.tsx`

- [ ] **Step 1: Create the file**

  ```tsx
  import { useState, useCallback, useEffect } from "react";
  import type { MoodboardItem } from "@/types";
  import { fetchItems, createItem, deleteItem, patchItemComplete, patchItemNote } from "@/lib/api";
  import { DiscoverCard } from "@/components/DiscoverCard";
  import { AddDiscoverModal } from "@/components/AddDiscoverModal";

  type TypeFilter = "all" | "movie" | "reel" | "link";
  type StatusFilter = "all" | "want" | "done";

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
            {displayed.map((item) => (
              <DiscoverCard
                key={item.id}
                item={item}
                onRemove={removeItem}
                onToggleComplete={toggleComplete}
                onUpdateNote={updateNote}
              />
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
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add artifacts/moodboard/src/pages/discover.tsx
  git commit -m "feat: add Discover page with masonry grid and filter chips"
  ```

---

## Task 13: Update `fetchItems` to accept a board param + wire tab switcher in `moodboard.tsx`

**Files:**
- Modify: `artifacts/moodboard/src/lib/api.ts` (add `board` param to `fetchItems`)
- Modify: `artifacts/moodboard/src/pages/moodboard.tsx` (tab switcher + conditional render)

- [ ] **Step 1: Update `fetchItems` signature in `api.ts`**

  Find the existing `fetchItems` function and update it:

  ```ts
  export async function fetchItems(board: string = "moodboard"): Promise<MoodboardItem[]> {
    const res = await fetch(`${BASE}/items?board=${encodeURIComponent(board)}`);
    if (!res.ok) throw new Error(`Failed to fetch items: ${res.status}`);
    return res.json();
  }
  ```

  The existing call in `moodboard.tsx` (`fetchItems()`) passes no argument and gets `"moodboard"` by default — no other changes needed there.

- [ ] **Step 2: Add `activeTab` state and import `Discover` in `moodboard.tsx`**

  At the top of `artifacts/moodboard/src/pages/moodboard.tsx`, add the import:
  ```ts
  import Discover from "@/pages/discover";
  ```

  Inside the `Moodboard` component, add one new piece of state after the existing state declarations:
  ```ts
  const [activeTab, setActiveTab] = useState<"board" | "discover">("board");
  ```

- [ ] **Step 3: Replace the topbar content in `moodboard.tsx`**

  Find the existing topbar JSX block (starts with `<div className="moodboard-topbar">`). Replace its entire contents with:

  ```tsx
  <div className="moodboard-topbar">
    <span className="topbar-wordmark">moodboard</span>
    <div className="topbar-divider" aria-hidden="true" />

    {/* Tab switcher */}
    <div className="tab-switcher">
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
    </div>

    {/* Board-only controls */}
    {activeTab === "board" && (
      <>
        <button className="reset-btn" onClick={resetView} title="Reset view">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          Reset view
        </button>
        <span className="item-count">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </>
    )}

    {/* Search — shared, always visible */}
    <div className="search-wrap">
      <svg className="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
      </svg>
      <input
        ref={searchInputRef}
        type="text"
        className="search-input"
        placeholder="Search… (⌘K)"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        aria-label="Search tiles"
      />
      {searchQuery && (
        <button
          className="search-clear-btn"
          onClick={() => { setSearchQuery(""); searchInputRef.current?.focus(); }}
          aria-label="Clear search"
        >
          ×
        </button>
      )}
    </div>

    {/* Board-only: Surprise Me */}
    {activeTab === "board" && (
      <button
        className="surprise-btn"
        onClick={handleSurpriseMe}
        disabled={items.length === 0}
        title="Highlight a random tile"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
        <span className="surprise-btn-label">Surprise me</span>
      </button>
    )}

    <ThemeToggle theme={theme} onToggle={toggleTheme} />
  </div>
  ```

- [ ] **Step 4: Wrap the canvas and FAB so each tab owns its view**

  Find the section in `moodboard.tsx` that renders the canvas wrapper (the `<div ref={wrapperRef}>`) and the FAB. Wrap the canvas in a display-toggle div and render `<Discover>` conditionally below it. Replace from the canvas wrapper down to (but not including) `{isModalOpen && ...}`:

  ```tsx
  {/* Board canvas — stays mounted to preserve pan/zoom state */}
  <div style={{ display: activeTab === "board" ? undefined : "none" }}>
    <div ref={wrapperRef} className="moodboard-wrapper">
      <div ref={canvasRef} className="moodboard-canvas">
        {loading ? (
          <div className="empty-state">
            <div className="empty-state-inner canvas-loading">
              <span className="loading-dot" />
              <span className="loading-dot" />
              <span className="loading-dot" />
            </div>
          </div>
        ) : loadError ? (
          <div className="empty-state">
            <div className="empty-state-inner">
              <p>Couldn't connect to the server. Please refresh.</p>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-inner">
              <span className="empty-state-headline">Start collecting</span>
              <p>Add a link or photo to begin building your board</p>
            </div>
          </div>
        ) : (
          displayedItems.map((item) => (
            <MoodboardCard
              key={item.id}
              item={item}
              onRemove={removeItem}
              onToggleComplete={toggleComplete}
              onPhotoClick={setLightboxSrc}
              isHighlighted={item.id === surpriseId}
              onUpdateNote={updateNote}
            />
          ))
        )}
      </div>
    </div>

    {showSearchEmpty && (
      <div className="search-empty-state">
        <div className="search-empty-inner">
          <p>No results for &ldquo;{searchQuery}&rdquo;</p>
        </div>
      </div>
    )}

    {showHint && (
      <div className={`drag-hint ${hintFading ? "fading" : ""}`}>
        Drag to explore
      </div>
    )}

    {/* Board FAB */}
    <button className="fab-btn" onClick={() => setIsModalOpen(true)} aria-label="Add item">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 5v14M5 12h14" />
      </svg>
      <span className="fab-label">Add</span>
    </button>
  </div>

  {/* Discover page — manages its own FAB and modal */}
  {activeTab === "discover" && (
    <Discover searchQuery={searchQuery} />
  )}
  ```

- [ ] **Step 5: Verify the board modal is still guarded by `activeTab`**

  The existing `{isModalOpen && <AddItemModal ...>}` block lower in the file only opens when the board FAB is clicked (which is now only rendered when `activeTab === "board"`), so no extra guard is needed.

- [ ] **Step 6: Push and verify in browser**

  ```bash
  git add artifacts/moodboard/src/lib/api.ts \
          artifacts/moodboard/src/pages/moodboard.tsx
  git commit -m "feat: wire Board/Discover tab switcher into moodboard"
  git push
  ```

  After Render deploys (≈ 2 min):
  1. Open https://moodboard-zyji.onrender.com
  2. Confirm "Board | Discover" tab switcher appears in the topbar.
  3. Click "Discover" — sees the empty state "Start discovering".
  4. Click "+ Add" → modal opens with Movie / Reel / Link tabs.
  5. Type a movie title (e.g. "Interstellar") → results appear → select one → "Add to Discover".
  6. Movie card appears in the masonry grid with poster, title, "Want to watch" badge.
  7. Click the check button → card greys out, badge changes to "Watched ✓".
  8. Click "Board" tab → existing moodboard is intact, pan/zoom state preserved.
  9. Search (⌘K) on Board tab searches board items. Switch to Discover, ⌘K searches discover items.

---

## Done

All 13 tasks complete. The Discover section is fully functional with zero changes to existing moodboard data or behaviour.
