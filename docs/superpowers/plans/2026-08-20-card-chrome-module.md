# Card and Modal Chrome Implementation Plan

**Goal:** Collapse the card and modal chrome that was retyped per file — note editors, icon SVGs, the overlay/drawer shell, the quote palette, upload buttons, tab strips, and two small URL helpers — into shared modules, without changing what any of it looks or behaves like.

**Architecture:** Eight new modules, each covering one piece of duplicated chrome that appeared in two or more files:

| Module | Collapses |
| --- | --- |
| `components/icons.tsx` | `CheckIcon`, `PencilIcon`, `PinIcon`, `EditIcon`, `MapPinIcon`, the remove-× — each redefined 2–5×, byte-identical except two sizes |
| `components/CardNoteEditor.tsx` | The note-dot, pencil trigger, and inline editor in MoodboardCard, DiscoverCard, PlaceCard |
| `components/ModalShell.tsx` | The overlay/drawer/handle/label wrapper in all 7 modals |
| `lib/quoteColors.ts` + `components/QuoteColorPicker.tsx` | `QUOTE_COLORS`/`QUOTE_COLOR_LABELS`/`isQuoteColor`, duplicated verbatim between AddQuoteModal and EditQuoteModal |
| `components/UploadPhotoButton.tsx` | The hidden-file-input-plus-trigger-button in AddDiscoverModal, AddPlaceModal, EditDiscoverItemModal |
| `components/ModalTypeTabs.tsx` | The tab-strip in AddDiscoverModal and AddPlaceModal |
| `lib/urlUtils.ts` | `normalizeUrl` / `getDomain`, each duplicated 2–4× |

**Working directory:** paths below are relative to `artifacts/moodboard/`.

---

## Design decisions

**`CardNoteEditor` owns the draft text; the card keeps `isEditing`.** All three note editors are structurally identical (state, focus-on-open, 150ms blur delay, 300-char cap, Escape/⌘Enter, the save button). But each card's own click handler checks `isEditingNote` to suppress opening the item while the textarea has focus — the overlay doesn't always cover the whole card, so a click elsewhere would otherwise fall through. That means the card has to keep the boolean; only the draft text, ref, and handlers move into the shared component. Interface: `{ note, isEditing, onEditingChange, onSave, placeholder? }`.

**`ModalShell` doesn't own focus.** Five of seven modals focus a field with `useEffect(() => ref.current?.focus(), [])`; two use native `autoFocus`; one (AddPlaceModal) re-focuses on every tab change, not just on mount. Three genuinely different behaviors don't collapse into one shared prop without losing one of them, so each modal keeps its own tiny focus effect. `ModalShell` only owns the overlay, click-outside-to-close, the drawer, and an optional title line — `label` is omitted for PlaceDetailModal, which has its own header.

**`UploadPhotoButton` takes a `label` string, not a status enum.** The three callers' microcopy differs in ways that don't reduce to one shape (`"Thumbnail uploaded ✓"` vs `"Thumbnail changed ✓"` vs a third with a `"Processing…"` state the other two don't have). The caller composes its own string; the component owns the hidden input, the ref, the icon, and the `has-file` class.

**Modal-drawer's "Fetch details" button was not converted.** It shares the `modal-upload-btn` CSS class with the real upload buttons for styling only — no icon, no file input. Converting it to `UploadPhotoButton` would have forced a fake `onFileSelect` onto something that isn't a file picker.

**AddItemModal's upload button was not converted either** — different icon (a photo/image glyph, not the shared up-arrow) and different semantics (selecting a file immediately creates and submits a whole new item, not "attach this to the form").

## A bug found along the way

Only `EditDiscoverItemModal`'s file-change handler reset `e.target.value = ""` after reading the file; `AddDiscoverModal`'s and `AddPlaceModal`'s didn't, so re-selecting the identical file a second time would silently no-op. `UploadPhotoButton` resets it unconditionally now — one of three callers already relied on this being correct, and the fix costs the other two nothing.

## What was deliberately left alone

**The highlight mechanism stays inconsistent.** MoodboardCard uses a CSS class (`is-highlighted`); the other three use a `data-highlight` attribute. Both work; unifying them means touching `index.css`'s corresponding selectors, which is a styling change, not chrome extraction — out of scope here.

**Per-card unique behavior stayed put**: MoodboardCard's photo-type branch, lightbox click-through, and `SkeletonCard` export; DiscoverCard's price/availability pills and per-type badge helpers; PlaceCard's Maps-link pill and click-opens-detail-modal; QuoteCard's overflow detection and Read More portal. None of this is duplicated — it's what makes each card its own type.

---

## File Structure

- **Create** `components/icons.tsx`, `components/CardNoteEditor.tsx`, `components/ModalShell.tsx`, `components/QuoteColorPicker.tsx`, `components/UploadPhotoButton.tsx`, `components/ModalTypeTabs.tsx`, `lib/quoteColors.ts`, `lib/urlUtils.ts`.
- **Modify** all four cards (`MoodboardCard.tsx`, `DiscoverCard.tsx`, `PlaceCard.tsx`, `QuoteCard.tsx`) and all seven modals (`AddItemModal.tsx`, `AddQuoteModal.tsx`, `EditQuoteModal.tsx`, `AddDiscoverModal.tsx`, `AddPlaceModal.tsx`, `EditDiscoverItemModal.tsx`, `PlaceDetailModal.tsx`) to consume the shared modules in place of their own copies.

---

## Verification

```bash
pnpm run typecheck                                   # all 4 packages
pnpm --filter @workspace/moodboard run test          # 37 passing, unaffected — this is a pure UI extraction
PORT=20658 BASE_PATH=/ pnpm --filter @workspace/moodboard run build
```

Manual browser pass (no `DATABASE_URL` available in this environment, so against the Vite dev server directly rather than the full stack): opened AddItemModal, AddQuoteModal, AddDiscoverModal (Movie/Reel tabs), and AddPlaceModal (Search/Manual tabs) and confirmed `ModalShell`, `ModalTypeTabs`, `QuoteColorPicker`, and `UploadPhotoButton` all render and respond to clicks correctly. Confirmed via the JS bundle shrinking from 263.35kB to 256.25kB that this is real deduplication, not just relocation.

**Not verified live**, for lack of any saved item to open: `CardNoteEditor` on an actual card, `EditQuoteModal`, `EditDiscoverItemModal`, and `PlaceDetailModal`. All four typecheck and build clean, and `EditQuoteModal`/`EditDiscoverItemModal` reuse exactly the same `QuoteColorPicker`/`UploadPhotoButton` already confirmed working on their Add-modal counterparts — but worth a manual pass against a real deploy before merging: add a card on each of the four tabs, edit its note, edit a quote's colour, edit a discover tile's thumbnail, and open a place's detail modal.
