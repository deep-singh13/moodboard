# Board Module Implementation Plan

**Goal:** Collapse the four per-tab board state machines (`moodboard`, `discover`, `quotes`, `places`) into one `useBoard` module, so the optimistic-write-and-roll-back logic lives in one place instead of four drifting copies.

**Architecture:** `src/lib/useBoard.ts` owns items and every mutation for a board; the pages keep only their own filters, modals and layout. Spotlight highlight-and-scroll moves to a second small module, `src/lib/useHighlight.ts`, shared by the three grid tabs. The Board tab keeps its own canvas-pan version, which is a different mechanism and doubles as the Surprise Me target.

**Tech Stack:** React + TypeScript + Vite, plain CSS. This change also introduces the repo's first test runner — Vitest + jsdom + Testing Library — so the new module is verified through its interface rather than by hand.

**Working directory:** paths below are relative to `artifacts/moodboard/`.

---

## Why this shape

The four copies were not identical, and the differences decided the interface:

| | board | discover | quotes | places |
| --- | --- | --- | --- | --- |
| insert position | append | prepend | prepend | prepend |
| pin | — | yes | yes | yes |
| complete / note | yes | yes | — | yes |
| extras | stamps `size` | price refresh, thumb toast | — | closes detail modal |

Decisions taken:

1. **The Board joins the module.** Excluding it would leave the optimistic-rollback body in two places, which is exactly the drift that produced two different "couldn't save" strings. Its one real difference — appending rather than prepending, because prepending reshuffles the spatial packing — becomes the `insert` option. `size` stamping stays in the page, since it only means anything to `computeLayout`.
2. **Highlight is a separate module.** The three grid tabs share it exactly, modulo a CSS scope selector. The Board's version pans a canvas with an eased rAF loop and shares no code, so folding both behind one interface would mean a mode flag selecting between two unrelated implementations.
3. **Drift is normalized, behaviour is not.** The Board's longer error string was pure drift and is gone. Quotes did **not** gain `toggleComplete`/`updateNote` — that would be a product change, not a refactor.
4. **Tab-specific extras stay in the pages.** `add` returns `Promise<boolean>` and `remove` returns `Promise<void>` so a page can compose on the result rather than handing the module a callback to sequence. Discover's price refresh uses the module's `replace` to swap in the server-authoritative row.
5. **Vitest is set up properly**, per CLAUDE.md's rule about not adding test files without a runner.
6. **The three shallow patch functions are deleted.** `patchItemComplete`, `patchItemPinned` and `patchItemNote` had byte-identical bodies differing only in one key; `patchItemEdit` was widened to cover them.

Two ordering facts the module depends on:

- The server returns `ORDER BY pinned DESC, added_at DESC` (`artifacts/api-server/src/routes/items.ts`). `sortItems` re-derives that order client-side so an optimistic insert lands where a reload would put it. **The two must stay in agreement.**
- Network calls moved out of the `setItems` updater. React may run an updater more than once per commit, so firing a PATCH from inside one was never safe; handlers now read current items from a ref and issue the call outside.

---

## File Structure

- **Create** `src/lib/useBoard.ts` — items, loading, load/add error, and every mutation for one board.
- **Create** `src/lib/useHighlight.ts` — flash-and-scroll for a Spotlight pick, scoped by CSS selector.
- **Create** `src/lib/useBoard.test.ts` — 19 cases over the module's interface.
- **Create** `vitest.config.ts` — standalone; `vite.config.ts` throws without `PORT`/`BASE_PATH`.
- **Modify** `src/lib/api.ts` — widen `patchItemEdit`, delete the three single-key patch functions.
- **Modify** `src/pages/moodboard.tsx` — consume `useBoard({ insert: "append" })`, drop four handlers and the load effect.
- **Modify** `src/pages/discover.tsx` — consume both modules; keep price refresh, thumb toast, filters.
- **Modify** `src/pages/quotes.tsx` — consume both modules; drop its inline copies of `useColumnCount`/`sortItems`/`toColumns` in favour of `gridUtils`.
- **Modify** `src/pages/places.tsx` — consume both modules; keep the detail-modal close on delete.
- **Modify** `package.json`, `pnpm-workspace.yaml` — test runner and the platform fix below.

---

## Tasks

- [x] **Task 1 — `useBoard`.** Load by board; optimistic add with rollback and a 4s error flash; remove; `update(id, patch)` with pin-aware re-sorting; `toggleComplete`/`togglePin`/`updateNote` on top of it; `replace` for server-authoritative rows.
- [x] **Task 2 — `useHighlight`.** Flash id, rAF then `scrollIntoView`, 1800ms clear, timer cleared on unmount.
- [x] **Task 3 — `api.ts`.** Widen `patchItemEdit` to accept `note`/`completed`/`pinned`; delete `patchItemComplete`, `patchItemPinned`, `patchItemNote`.
- [x] **Task 4 — the four pages.** Replace local state machines with the modules, preserving each page's own extras.
- [x] **Task 5 — Vitest.** `vitest run` via `pnpm --filter @workspace/moodboard run test`.

---

## Platform fix (needed to run any of this locally)

The Replit template's `overrides` in `pnpm-workspace.yaml` strip every non-Linux-x64 native binary — `"rollup>@rollup/rollup-darwin-arm64": "-"` and the same for esbuild, lightningcss and `@tailwindcss/oxide`. On Apple Silicon that makes `vite build` and any Vitest run fail with `Cannot find module @rollup/rollup-darwin-arm64`. Those four `darwin-arm64` strips are removed so the frontend can be built and tested on a Mac; the unrelated `@expo/ngrok-bin` strip is left in place, and no Linux entry is touched, so the Replit install is unaffected.

`allowBuilds` was also left by pnpm as a literal `set this to true or false` placeholder, which fails every `pnpm run`. It is now `esbuild: true` / `sharp: true` — the declarative form of the one-time `pnpm approve-builds` step CLAUDE.md describes.

---

## Verification

```bash
pnpm run typecheck                                   # all 4 packages
pnpm --filter @workspace/moodboard run test          # 19 passing
PORT=20658 BASE_PATH=/ pnpm --filter @workspace/moodboard run build
```

Still worth a manual browser pass: add/delete on each tab, pin re-ordering on Discover/Quotes/Places, a note edit, Spotlight pick on all four tabs, and Surprise Me on the Board.
