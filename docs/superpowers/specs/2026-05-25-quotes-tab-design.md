# Quotes Tab — Design Spec
_Date: 2026-05-25_

## Overview

Add a "Quotes" tab to the moodboard application where the user can save personal quotes with optional author attribution. Quotes are displayed in the same Pinterest-style masonry grid as the Discover tab. Each card has a soft pastel background chosen by the user at save time.

---

## Approach

Reuse the existing `MoodboardItem` infrastructure. A quote is a new `type: "quote"` item stored in the existing `items` table with `board: "quotes"`. No backend changes required.

---

## Data Model

A quote maps onto `MoodboardItem` as follows:

| Field      | Value                                              |
|------------|----------------------------------------------------|
| `type`     | `"quote"` — new value added to the type union      |
| `title`    | The quote text (required)                          |
| `subtitle` | Optional author/attribution (e.g. `— Marcus Aurelius`) |
| `meta`     | JSON string: `{"color": "sage"}` — chosen card color |
| `url`      | `"quote://local"` — unused placeholder             |
| `board`    | `"quotes"` — routes to correct backend bucket      |
| `addedAt`  | ISO timestamp                                      |

**`MoodboardItem` type union change:**
```ts
type: "substack" | "youtube" | "link" | "photo" | "movie" | "reel" | "quote"
```

**Available colors (6):** `sage`, `blush`, `lavender`, `peach`, `sky`, `slate`

Default color when opening the Add modal: `sage`.

---

## Tab Navigation

The topbar tab switcher gains a third tab:

```
Board   Discover   Quotes
```

Same `tab-btn` / `active` pattern as the existing two tabs. The Quotes page mounts conditionally when `activeTab === "quotes"`, consistent with how Discover is handled.

---

## QuoteCard Component (`QuoteCard.tsx`)

A new component. No image, no type badge, no completed/check state, no note button.

**Visual anatomy:**
- Soft pastel background (color from `meta.color`)
- Quote text: `Instrument Serif` italic, wraps naturally, no truncation
- Author line: small `DM Sans`, muted opacity — only rendered if `subtitle` is non-empty
- Hover actions: edit button (top-left), remove button (top-right) — same style as `DiscoverCard`

**Text color:** Dark on light backgrounds in light mode; light on dark backgrounds in dark mode — managed via CSS custom properties per color name.

---

## Quotes Page (`quotes.tsx`)

Mirrors the structure of `discover.tsx`:

- Fetches items via `fetchItems("quotes")` on mount
- Same `useColumnCount` responsive masonry layout (2 / 3 / 4 columns)
- Same optimistic add/remove pattern with server sync fallback
- Header: eyebrow + title + item count (same pattern as Discover)
- FAB (bottom-right) opens `AddQuoteModal`
- No filter chips — quotes have no type or status to filter by
- Empty state with a short prompt to add the first quote

---

## AddQuoteModal (`AddQuoteModal.tsx`)

Fields:
1. **Quote** — `<textarea>`, ~4 rows, required. Save button disabled until non-empty.
2. **Author (optional)** — single-line `<input>`. If blank, no attribution appears on card.
3. **Color** — 6 color-filled pill buttons (`[Sage] [Blush] [Lavender] [Peach] [Sky] [Slate]`), Sage pre-selected. Each pill is filled with its actual color; selected pill has a darker border ring.

On save: constructs a `MoodboardItem` with `type: "quote"`, `board: "quotes"`, `url: "quote://local"`, `meta: JSON.stringify({ color })`, and calls `createItem`.

---

## EditQuoteModal (`EditQuoteModal.tsx`)

Identical layout to `AddQuoteModal`, pre-filled with the existing item's `title`, `subtitle`, and `meta.color`. On save calls `patchItemEdit` (title + subtitle) and a new `patchItemMeta` call, or encodes the update in the existing patch endpoint.

> **Note:** The existing `patchItemEdit` only patches `title` and `imageUrl`. Editing the color requires also patching `meta`. The PATCH handler already accepts arbitrary fields on the body — confirm whether `meta` can be added to the existing patch or if a dedicated call is needed.

---

## Files to Create / Modify

### New files
- `artifacts/moodboard/src/pages/quotes.tsx`
- `artifacts/moodboard/src/components/QuoteCard.tsx`
- `artifacts/moodboard/src/components/AddQuoteModal.tsx`
- `artifacts/moodboard/src/components/EditQuoteModal.tsx`

### Modified files
- `artifacts/moodboard/src/types/index.ts` — add `"quote"` to type union
- `artifacts/moodboard/src/pages/moodboard.tsx` — add "Quotes" tab + conditional render
- `artifacts/moodboard/src/lib/api.ts` — add `patchItemMeta` if needed
- `artifacts/moodboard/src/index.css` — quote card color variables + card styles
- `artifacts/api-server/src/routes/items.ts` — add `meta` to PATCH handler if not already supported

---

## Out of Scope

- Quotes do not have a completed/watched state
- Quotes do not have a note field
- No search filtering within the Quotes tab (global search in topbar still works)
- No import/export of quotes
