# Spotlight Search — Design

**Date:** 2026-06-14
**Status:** Approved

## Summary

Replace the inline topbar search (which filters tiles in place) with a centered,
macOS-Spotlight-style search modal. The modal opens with ⌘K or by clicking the
topbar search element, shows matching items as a thumbnail tile grid, and on
selection jumps the view to that item.

Each tab (Board, Discover, Quotes) gets its **own** Spotlight that searches only
**that tab's** items. All inline `searchQuery` filtering is removed.

## Goals

- Centered overlay search, opened via ⌘K or topbar trigger, on every tab.
- Results render as thumbnail tiles (image + title + type badge), with a text
  fallback for items that have no image (e.g. quotes).
- Selecting a result jumps the active tab's view to that item and briefly
  highlights it.
- Keyboard-first: ↑↓←→ to move selection, Enter to select, Esc to close.

## Non-goals

- Cross-tab / global search. Each Spotlight is scoped to its own tab's items.
- Fuzzy ranking. Substring match on existing fields is sufficient.
- Persisting recent searches or search history.

## Architecture

### New component: `SpotlightSearch.tsx`

Presentational and tab-agnostic. It knows nothing about canvases or grids.

```
interface SpotlightSearchProps {
  open: boolean;
  onClose: () => void;
  items: MoodboardItem[];
  onSelect: (item: MoodboardItem) => void;
  placeholder?: string;
}
```

Responsibilities:
- Owns local query state; resets query when `open` transitions to true.
- Filters `items` by substring match on `title`, `subtitle`, and `note`
  (reuse the existing `matchesSearch` logic; lift it into the component).
- Renders a centered panel with a search input and a result tile grid.
- Tile = thumbnail (`item.imageUrl`) + title + small type badge. When
  `imageUrl` is absent, render a text tile showing the title/subtitle.
- Keyboard: ↑↓←→ move the highlighted index across the grid, Enter calls
  `onSelect` with the highlighted item, Esc calls `onClose`. Mouse hover sets
  the highlighted index; click selects.
- Autofocus the input on open.
- Empty state: `No results for "<query>"`.

### Shared open-state, three consumers

`Moodboard` owns a single `spotlightOpen: boolean`. The topbar search element
becomes one **trigger button** (label `Search… ⌘K`), visible on every tab. ⌘K
toggles `spotlightOpen`. The flag is routed to the active tab:

- **Board** (rendered inside `Moodboard`):
  `<SpotlightSearch open={spotlightOpen && activeTab === 'board'}
     items={layoutItems} onSelect={selectBoardItem} onClose={closeSpotlight} />`
- **Discover** and **Quotes**: each receives `spotlightOpen` and
  `onSpotlightClose` props (replacing the current `searchQuery` prop) and
  renders its **own** `SpotlightSearch` over its **own** `items`. Each guards
  on being the active tab implicitly, since the page only mounts when active.

### Select behavior per tab

- **Board:** `scrollToItem(item)` pans the canvas; reuse the existing
  `surpriseId` highlight to pulse the landed tile.
- **Discover / Quotes:** set a new `highlightId` state in the page, scroll the
  card into view via `data-item-id` lookup +
  `scrollIntoView({ behavior: 'smooth', block: 'center' })`, and pass
  `highlightId` down so the matching card renders a short highlight pulse.
  Clear `highlightId` after a timeout.

## Data flow

```
⌘K / topbar trigger
   → Moodboard.setSpotlightOpen(true)
       → active tab's <SpotlightSearch open>
           → user types → local filter over that tab's items
           → user selects → onSelect(item)
               → Board:   scrollToItem + surpriseId pulse
               → Disc/Qts: scrollIntoView + highlightId pulse
           → onClose → setSpotlightOpen(false)
```

## Removed

- Inline `searchQuery` state filtering on all three tabs
  (`displayedItems`/`showSearchEmpty` on Board; `searchQuery` prop + inline
  `matchesSearch` filter on Discover and Quotes).
- ⌘K focusing the inline input; Esc-to-clear-search behavior.

## Styling (`index.css`)

- Centered panel, max-width ~640px, translucent blurred backdrop, soft shadow,
  rounded corners, subtle scale + fade entrance.
- Theme-aware via `data-theme` (light/dark), matching existing tokens.
- Tiles reuse the existing card visual language.

## Testing

- `SpotlightSearch` in isolation: typing filters results; arrow keys move the
  highlighted index; Enter fires `onSelect` with the highlighted item; Esc
  fires `onClose`; empty query shows all items; no-match shows the empty state.
- Manual: ⌘K opens on each tab and searches only that tab's items; selecting a
  Board result pans the canvas and pulses the tile; selecting a Discover/Quotes
  result scrolls the grid to the card and pulses it.

## Open questions

None.
