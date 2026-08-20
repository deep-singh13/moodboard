# Items Repository Implementation Plan

**Goal:** Give `routes/items.ts` a deep module to call instead of building SQL, deciding storage policy, and validating inline across six handlers. Collapse `PATCH /items/:id`'s up to seven un-transacted statements into one.

**Architecture:** Two new `lib/` modules plus one extraction:

- `lib/itemValidation.ts` — pure. Type/board/meta/id validation, the data-URL storage-policy decision, and `buildUpdateAssignments` (patch → column/value pairs, no SQL yet). No `./db` import, so it's importable and testable without `DATABASE_URL`.
- `lib/items.ts` — the repository. Imports `./db` and `./itemValidation`; owns every statement against the `items` table.
- `lib/concurrency.ts` — `mapWithConcurrency`, extracted verbatim from the route file it was living in; generic, unrelated to items specifically.

`routes/items.ts` keeps only: parse the request, call the module, map the result (or a thrown `InvalidItemError`) to a status code.

**Working directory:** paths below are relative to `artifacts/api-server/`.

---

## What moved and why

**The SET-clause builder.** PATCH used to be seven independent `if (x in body) await pool.query(...)` blocks, each hand-numbering its own `$1`/`$2`, with no transaction — a failure partway through left a partial write and returned 500. `buildUpdateAssignments` turns a patch into an ordered list of `{column, value}` pairs; `items.update()` turns that into one `UPDATE ... SET ... WHERE id = $N RETURNING *`. One Postgres statement is atomic by construction, so there's no partial-update state to reach, and the positional-parameter bookkeeping (previously hand-done per field, and exactly the kind of thing an added field could silently miscount) is now one `.map((a, i) => ...)`.

**The two presence idioms.** `!== undefined` (completed/pinned) and `"x" in body` (everything else) coexisted. Since `express.json()` always parses the body first (confirmed in `app.ts`), and JSON has no way to serialize an explicit `undefined`, the two idioms were already behaviorally identical over the wire — but having two conventions in one function invites exactly the kind of divergence that matters once someone adds a field under the wrong one. `buildUpdateAssignments` uses `"x" in patch` uniformly.

**Storage policy.** The data-URL-vs-link decision for `imageUrl` was written once in POST and again, slightly differently, in PATCH. `imageColumns()` is now the one place it's decided; both `insert()` and `update()` call it.

**The refresh-eligibility rule.** `WHERE board = 'discover' AND type = 'link' AND url IS NOT NULL` was a literal string in the route handler — a business rule about what this table means, sitting in the code that happens to trigger a refresh. It's now `items.listRefreshableLinks()`.

**Validation.** `type` wasn't checked against the eight-value union, `board` wasn't checked against the four boards, `id` wasn't checked to look like a UUID. There is no schema shared between client and server for this table (Drizzle/Zod/api-spec exist but aren't wired up, per CLAUDE.md), so `itemValidation.ts` keeps its own copy of these unions — confirmed against `types/index.ts` (8 item types) and `extension/popup.js`'s `detectType()` (only ever emits `youtube`/`substack`/`link`, all inside the set) so this doesn't reject anything either real writer sends. `insert()` validates; `listByBoard()` (a read) does not — an unrecognized `board` on a read just yields zero rows, harmless; on a write it would persist a value nothing in the UI can reach again.

**Error handling.** Every route had a bare `catch {}` — a constraint violation and a connection failure were indistinguishable in the logs. `InvalidItemError` (thrown by the validation functions) now maps to 400 with the actual reason; anything else is `console.error`'d before a generic 500.

## Two response-shape changes, both backward-compatible

- **PATCH now returns the updated row** (via `RETURNING *`), not `{ok: true}`. `RETURNING *` was already required to build one atomic statement, so returning it is free. Checked: the client's `patchItemEdit` (`lib/api.ts`) only inspects `res.ok`, never the body — no client change needed.
- **PATCH and DELETE now 404 for a nonexistent id**, instead of silently reporting success. Checked: `useBoard.ts`'s `remove`/`update` already `.catch(() => {})` any rejection from these calls, so this is invisible in the UI; it only makes the API itself correct about what happened.

## Declined, deliberately

- **`position_x`/`position_y` stay in the schema**, always written as `0`. They're genuinely dead (layout is computed client-side, per CLAUDE.md), but dropping columns from a live table is a real schema migration — this repo's documented pattern is additive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` only. Not something to do as a side effect of an unrelated refactor.
- **`size` stays `TEXT`**, coerced both ways at the boundary exactly as before. Same reasoning — changing a column's type is a migration, not a repository-module concern.
- **No completed/pinned type validation.** The report flagged the missing `type`/`board`/`id` checks specifically; a non-boolean `completed` was never called out and still surfaces as a real (now properly logged) 500 rather than a new 400 nobody asked for.

---

## File Structure

- **Create** `src/lib/itemValidation.ts`, `src/lib/itemValidation.test.ts` — 33 tests.
- **Create** `src/lib/concurrency.ts`, `src/lib/concurrency.test.ts` — 6 tests.
- **Create** `src/lib/items.ts` — the repository; requires `DATABASE_URL` to import, like every other module touching `./db`.
- **Rewrite** `src/routes/items.ts` — six handlers, each now request-parsing plus one module call.

---

## Verification

```bash
pnpm run typecheck                                   # all 4 packages
pnpm --filter @workspace/api-server run test          # 72 passing (33 SSRF + 33 validation + 6 concurrency)
pnpm --filter @workspace/api-server run build          # esbuild bundle
pnpm --filter @workspace/moodboard run test            # 37 passing, unaffected
```

No manual browser check applies to the pure-logic half. Worth a smoke test against a live deploy: add/edit/pin/delete an item on each tab, and confirm a bulk price refresh on Discover still works — the repository's SQL is byte-for-byte the same read/write pattern as before, just reassembled from one place instead of six.
