# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal moodboard: an infinite pan/zoom canvas of saved things (links, YouTube, Substack, photos, movies, quotes, places), plus grid tabs for Discover / Quotes / Places. Two packages do all the work:

- `artifacts/moodboard` — React + Vite SPA (`@workspace/moodboard`)
- `artifacts/api-server` — Express 5 + Postgres API (`@workspace/api-server`)

Everything else in the tree is scaffolding from the Replit pnpm-workspace template and is **not** on the app's code path — see "Scaffolding vs. real code" below.

## Commands

pnpm only — the root `preinstall` script hard-fails npm/yarn.

Every `pnpm run` triggers a deps check first, and on a fresh clone that check **fails** with `ERR_PNPM_IGNORED_BUILDS: esbuild, sharp` before your script runs. Approve them once:

```bash
pnpm install
pnpm approve-builds        # allow esbuild + sharp postinstall; one-time
```

```bash
pnpm run typecheck          # tsc --build for lib/*, then per-package typecheck
pnpm run build              # typecheck + build every package

pnpm --filter @workspace/moodboard run typecheck
pnpm --filter @workspace/moodboard run build       # → artifacts/moodboard/dist/public
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run build      # esbuild → dist/index.mjs
pnpm --filter @workspace/api-server run dev        # build + start
```

**There is no test runner in this repo.** Verification is `pnpm run typecheck`, `pnpm run build`, and a manual browser check. Don't add `.test.ts` files unless you're also setting up the runner — a previous commit removed one for exactly this reason.

### Running locally

`artifacts/moodboard/vite.config.ts` *throws* unless both `PORT` and `BASE_PATH` are set, and there is **no `/api` dev proxy**. In production/Replit a path router puts the SPA at `/` and the API at `/api`; locally, the simplest full-stack run is to let the API server serve the built SPA (it statically serves `../../moodboard/dist/public` and falls through to `index.html`):

```bash
pnpm --filter @workspace/moodboard run build
DATABASE_URL=... PORT=8080 pnpm --filter @workspace/api-server run dev   # app on :8080
```

For Vite HMR only (API calls will 404 without a proxy):

```bash
PORT=20658 BASE_PATH=/ pnpm --filter @workspace/moodboard run dev
```

### Environment

| Var | Where | Notes |
| --- | --- | --- |
| `DATABASE_URL` | api-server | required; `sslmode=require` in the string switches on `rejectUnauthorized: false` |
| `PORT` | api-server, moodboard vite | required by both; each throws without it |
| `BASE_PATH` | moodboard vite | required; `/` locally |
| `OMDB_API_KEY` | api-server | movie search/detail; routes degrade to empty results without it |
| `MICROLINK_API_KEY` | api-server | optional — free tier (50/day) used when unset |
| `DISTRICT_INGEST_CITIES` | api-server | comma-separated, default `ncr` |
| `LOG_LEVEL`, `NODE_ENV` | api-server | non-production adds `pino-pretty` |

## Database: no ORM, no migrations

The API talks to Postgres through a raw `pg` Pool with hand-written SQL (`artifacts/api-server/src/lib/db.ts`, `routes/items.ts`). Drizzle exists in `lib/db` but its schema file is empty and nothing imports it.

Schema is created and evolved idempotently by `initDb()` at boot: one `CREATE TABLE IF NOT EXISTS` plus a run of `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. **To add a column, append another `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` to `initDb()`** — do not introduce drizzle-kit migrations without converting the whole thing.

Two tables:

- `items` — every saved thing, across every tab. **Tabs are a `board` column, not separate tables**: `moodboard` (default) | `discover` | `quotes` | `places`. Type-specific extras live in `meta`, a JSON *string* parsed by consumers (see `PlaceMeta` in `artifacts/moodboard/src/types/index.ts`). Images are stored permanently as base64 WebP data URLs in `image_data`, so CDN expiry never breaks a card; `rowToItem()` collapses `image_url ?? image_data` into a single `imageUrl` for the client.
- `district_places` — local searchable index of district.in restaurant pages, self-populating on boot (`ensureDistrictIndex()`, fired after `listen` and deliberately not awaited — a cold ingest takes minutes and would stall the health check).

## API server

Routes live in `src/routes/*.ts`, each an Express `Router`, all mounted under `/api` via `src/routes/index.ts`. `src/app.ts` also serves the built SPA and its catch-all `index.html`.

Things to preserve when touching this code:

- **Any outbound fetch of a user-supplied URL must go through `safeFetch` from `src/lib/url-safety.ts`.** It's an SSRF guard: DNS-resolves and rejects loopback/private/link-local/CGNAT/reserved addresses, refuses non-http(s) schemes and embedded credentials, and re-validates on every redirect hop (redirects are followed manually). `fetchPrice` and `districtPlace` already use it.
- **`fetch-og` is a deliberate cascade**, cheapest first: YouTube oEmbed → generic OG/twitter-meta scrape → Microlink (the paid-ish fallback for Instagram/TikTok and JS-rendered pages). Keep new sources ahead of Microlink to preserve its quota.
- **Facts come from JSON-LD, not CSS classes.** `districtPlace.ts` parses the JSON-LD `Restaurant` block; `fetchPrice.ts` parses `Product`/`Offer` (with og:/product: price meta as fallback) and reports `unknown` rather than guessing. Don't add class-name scraping.
- Bulk operations use the `mapWithConcurrency` helper in `routes/items.ts` rather than firing every request at once.

## Frontend

`main.tsx` → `App.tsx` → `pages/moodboard.tsx`. That page (~700 lines) is the whole app shell: it owns the `TabId` state (`board | discover | quotes | places`) and renders `pages/discover.tsx`, `quotes.tsx`, `places.tsx` inline. **Tabs are not routes** — `wouter` is a dependency but no router is mounted. Each tab fetches its own board via `fetchItems("<board>")`.

- **All server calls go through the hand-written `src/lib/api.ts`.** The generated Orval clients in `lib/api-client-react` are unused.
- **Board layout is algorithmic, not stored.** `computeLayout()` in `pages/moodboard.tsx` packs cards outward from the origin by nearest-free-neighbour, falling back to a golden-angle spiral; sizes are drawn from a weighted `[220, 320, 420]`. `gridX`/`gridY` are computed client-side each load.
- **Styling is plain CSS.** `src/index.css` (~3000 lines) holds the design tokens — OKLCH warm-tinted palette, spacing/type scales, `--ease-out-*` curves (exponential ease-out only, no bounce) — and every component class. Tailwind, `components.json`, and the ~70 shadcn components under `src/components/ui/` are template scaffolding; only `pages/not-found.tsx` imports one, and `index.css` never imports Tailwind. **Write CSS in `index.css`, not utility classes.**
- **Theme** is `data-theme` on `<html>`, set by an inline script in `index.html` *before paint* (reads `localStorage["moodboard-theme"]`, falls back to `prefers-color-scheme`) and mirrored into the `theme-color` meta. Dark values are token overrides under `[data-theme="dark"]`.
- Spotlight (⌘K) is one generic `SpotlightSearch` component rendered per tab; the parent owns a single `spotlightOpen` flag and each tab supplies its own items and `onSelect`.

## Scaffolding vs. real code

Present, inherited from the Replit template, currently inert — don't assume it's wired up:

- `lib/db` (Drizzle; empty schema), `lib/api-spec` (Orval + `openapi.yaml`), `lib/api-zod`, `lib/api-client-react` (generated clients)
- `artifacts/mockup-sandbox` (`@workspace/mockup-sandbox`, a component-preview canvas at `/__mockup`)
- `scripts/` (only `hello.ts`)
- `artifacts/moodboard/src/components/ui/**`

`extension/` is real but standalone: an unbundled MV3 Chrome extension ("Moodboard Saver") that POSTs to the deployed API at `https://moodboard-zyji.onrender.com/api`. If API request/response shapes change, update `extension/popup.js` too.

## Conventions

- **`pnpm-workspace.yaml` sets `minimumReleaseAge: 1440` (1-day supply-chain delay). Do not remove or lower it** — add a package to `minimumReleaseAgeExclude` only for an urgent, trusted release, and remove the exclusion afterwards.
- Shared dependency versions come from the workspace `catalog:` — use `"catalog:"` in package.json rather than pinning a version, for anything already in the catalog.
- Non-obvious decisions are documented as a boxed comment block at the top of the file that implements them (`url-safety.ts`, `districtIndex.ts`, `districtPlace.ts`, `fetchPrice.ts`). Follow that: explain *why this approach and not the obvious one*, not what the code does.
- Feature work lands as a design spec + implementation plan under `docs/superpowers/specs/` and `docs/superpowers/plans/`, dated `YYYY-MM-DD-<slug>`.
- Commits use Conventional Commits with a scope (`feat(moodboard):`, `fix(api-server):`).
- Deployment config lives in each artifact's `.replit-artifact/artifact.toml` (dev/prod commands, ports, health check at `/api/healthz`). `scripts/post-merge.sh` runs on merge and does `pnpm install --frozen-lockfile` + a db push.
