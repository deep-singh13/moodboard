# Item Meta Codec Implementation Plan

**Goal:** Give the `meta` column one owner. Replace five hand-rolled `JSON.parse` call sites and five ad-hoc writers with typed, validating codecs — and stop editing a quote's colour from deleting the rest of its meta.

**Architecture:** `src/lib/itemMeta.ts` holds one decode/encode pair per meta-carrying item type (quote, movie, reel, place). Decoding never throws and type-checks every field; encoding merges into the raw stored object so unknown keys survive. The API server gains a parse guard so the column cannot hold non-JSON.

**Working directory:** paths below are relative to `artifacts/moodboard/` unless noted.

---

## Why this shape

`meta` is one TEXT column shared by every item type, so the database cannot describe its contents and the server treats it as opaque. That left five readers each repeating the same try/parse/fall-back-to-`{}` expression and then trusting the result — two of them through an unchecked `as PlaceMeta`.

The shapes genuinely differ, and they collide:

| type | stored keys | read today |
| --- | --- | --- |
| quote | `color` | `color` |
| movie | `year`, `genre`, `rating`, `director`, `imdbId` | `imdbId` only |
| reel | `username`, `reel_url` | none |
| place | 14 keys (`PlaceMeta`) | most of them |

`rating` is a **string** on a movie (OMDB gives `"7.8"`) and a **number** on a place, where `PlaceCard` calls `.toFixed(1)` on it. One wrongly-typed row was all it took to throw.

Decisions taken:

1. **One decoder per type, not a single `decodeMeta` returning a union.** Every card receives a plain `MoodboardItem`, so TypeScript cannot narrow a union off `item.type` at the call site; a shared decoder would push a narrowing check into all five readers. A caller always knows which kind of card it is.
2. **Decode is lenient but validating.** It never throws and never reports failure — a moodboard should render a slightly incomplete card, not an error state — but a wrong-typed field becomes absent rather than becoming a crash two components later.
3. **Encode merges into the raw stored object**, not the decoded one, so keys the codec doesn't know about survive an edit. This is what fixes the quote bug without inventing a migration.
4. **The write-only fields stay.** `username`, `reel_url`, `year`, `genre`, `rating`, `director` are written and never read, but they already exist on every stored row. Dropping them from the codec would make the first merge-encode silently delete them — data loss dressed as a cleanup.
5. **The server gets a parse guard, not a schema.** POST and PATCH reject a `meta` that isn't a JSON object string with 400. A shared schema across the two packages is a bigger change that would also need the Chrome extension updated.

---

## File Structure

- **Create** `src/lib/itemMeta.ts` — `QuoteMeta`/`MovieMeta`/`ReelMeta` types, `DecodedPlaceMeta`, and four decode/encode pairs.
- **Create** `src/lib/itemMeta.test.ts` — 18 cases.
- **Modify** `src/components/QuoteCard.tsx`, `DiscoverCard.tsx`, `PlaceCard.tsx`, `PlaceDetailModal.tsx`, `EditQuoteModal.tsx` — decode through the codec; both `as PlaceMeta` casts gone.
- **Modify** `src/components/AddQuoteModal.tsx`, `AddDiscoverModal.tsx`, `AddPlaceModal.tsx`, `EditQuoteModal.tsx` — encode through the codec.
- **Modify** `artifacts/api-server/src/routes/items.ts` — `isStorableMeta` guard on POST and PATCH.

---

## Tasks

- [x] **Task 1 — the codec.** Four decode/encode pairs; `parseObject` rejects arrays and primitives; `str`/`num`/`strings` validate per field; `merge` drops `undefined` and preserves unknown keys.
- [x] **Task 2 — readers.** Five call sites, including the two unchecked casts. `DecodedPlaceMeta` guarantees the three list fields so `?? []` disappears from `PlaceDetailModal`.
- [x] **Task 3 — writers.** Five call sites. `EditQuoteModal` now passes `item.meta` so the edit merges.
- [x] **Task 4 — palette narrowing.** `EditQuoteModal` validates the stored colour against `QUOTE_COLORS` with a type guard instead of `as QuoteColor`.
- [x] **Task 5 — server guard.** 400 on a `meta` that is present but not a JSON object string.
- [x] **Task 6 — tests.** Malformed input, per-field validation, round trips, and the merge-preserves-other-keys case that would have caught the quote bug.

---

## Verification

```bash
pnpm run typecheck                                   # all 4 packages
pnpm --filter @workspace/moodboard run test          # 37 passing (19 board + 18 meta)
PORT=20658 BASE_PATH=/ pnpm --filter @workspace/moodboard run build
```

Manual pass worth doing: edit a quote's colour and confirm the text and author survive; open a place card and its detail modal; click a movie card and confirm it still opens IMDb.

---

## Follow-on

`QUOTE_COLORS` and `QUOTE_COLOR_LABELS` are still duplicated between `AddQuoteModal` and `EditQuoteModal` — that belongs to the card/modal chrome candidate, not here.
