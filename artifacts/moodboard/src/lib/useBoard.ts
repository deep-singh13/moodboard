import { useCallback, useEffect, useRef, useState } from "react";
import type { MoodboardItem } from "@/types";
import { createItem, deleteItem, fetchItems, patchItemEdit } from "@/lib/api";
import { sortItems } from "@/lib/gridUtils";

/* ---------------------------------------------------------------------------
 * Why one module owns every board's items
 *
 * Each tab is a `board` column on the same table, not a separate resource, so
 * all four tabs ran the same state machine: load once, write optimistically,
 * roll back on rejection. That machine was written four times and had already
 * drifted — two different "couldn't save" strings, and a rollback that only
 * some copies re-sorted after. Bugs in it had to be found four times.
 *
 * The writes are optimistic rather than await-then-render because every one of
 * them is a single-field toggle the user expects to feel instant, and the API
 * has no conflict story worth waiting for. The cost is that a rejection has to
 * put the previous value back, which is precisely the part that kept drifting.
 *
 * The board is ordered `pinned DESC, added_at DESC` by the server
 * (routes/items.ts). `sortItems` re-derives that order client-side so an
 * optimistic insert or an un-pin lands where a reload would have put it —
 * the two orderings must agree, so changing one means changing the other.
 *
 * `insert` exists because the Board tab is spatially packed by computeLayout:
 * prepending there would reshuffle every card's position on each add, so it
 * appends and lets the next reload place the item. The grid tabs prepend so
 * new items appear top-left. That is the only behavioural difference between
 * the four boards worth parameterising.
 *
 * Everything a single tab does on top of this — Discover's price refresh and
 * thumbnail toast, Places closing its detail modal on delete — stays in the
 * page. `add` and `remove` return promises so a page can compose on the
 * result instead of handing this module a callback it would have to sequence.
 *
 * The three Add modals (AddItemModal, AddDiscoverModal, AddPlaceModal) build
 * on `add`/`update` the same way: insert a stub with whatever fields are
 * already known and close immediately, then patch in the rest (title,
 * image, meta) via `update()` once a metadata fetch — OG scrape, movie
 * detail, District place detail — resolves in the background. A failed
 * background fetch just leaves the stub's fallback fields in place; it's
 * silent for the same reason `update()` doesn't roll back on failure above.
 * ------------------------------------------------------------------------ */

export type BoardId = "moodboard" | "discover" | "quotes" | "places";

/** Where an optimistically-added item lands. See the note above. */
export type InsertPosition = "prepend" | "append";

/** The subset of an item a caller may patch. Mirrors PATCH /api/items/:id. */
export interface ItemPatch {
  title?: string | null;
  subtitle?: string | null;
  imageUrl?: string | null;
  meta?: string | null;
  note?: string | null;
  completed?: boolean;
  pinned?: boolean;
}

export interface UseBoardOptions {
  board?: BoardId;
  insert?: InsertPosition;
}

export interface Board {
  items: MoodboardItem[];
  loading: boolean;
  /** The initial load failed. Writes are still attempted; they just have nothing to roll back to. */
  loadError: boolean;
  /** Set for 4s after a failed add, then cleared. Null the rest of the time. */
  addError: string | null;

  /** Inserts optimistically. Resolves true if persisted, false if rolled back. */
  add(item: MoodboardItem): Promise<boolean>;
  /** Removes optimistically. A failed delete is swallowed, as it was before. */
  remove(id: string): Promise<void>;

  toggleComplete(id: string): void;
  /** Re-sorts, because pinned items sort first. */
  togglePin(id: string): void;
  updateNote(id: string, note: string | null): void;
  update(id: string, patch: ItemPatch): void;

  /** Swap in a server-authoritative item — used after an endpoint returns a fresher row. */
  replace(item: MoodboardItem): void;
}

const ADD_ERROR = "Couldn't save — check your connection.";
const ADD_ERROR_MS = 4000;

/** Applies a patch to an item the way the server will, mapping null to absent. */
function applyPatch(item: MoodboardItem, patch: ItemPatch): MoodboardItem {
  const next = { ...item };
  if ("title" in patch) next.title = patch.title ?? undefined;
  if ("subtitle" in patch) next.subtitle = patch.subtitle ?? undefined;
  if ("imageUrl" in patch) next.imageUrl = patch.imageUrl ?? undefined;
  if ("meta" in patch) next.meta = patch.meta ?? undefined;
  if ("note" in patch) next.note = patch.note ?? undefined;
  if (patch.completed !== undefined) next.completed = patch.completed;
  if (patch.pinned !== undefined) next.pinned = patch.pinned;
  return next;
}

export function useBoard({
  board = "moodboard",
  insert = "prepend",
}: UseBoardOptions = {}): Board {
  const [items, setItems] = useState<MoodboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Handlers read the current items to decide what to send the server (the new
  // value of a toggle, say). Reading them from a ref rather than from the
  // setState updater keeps the network call out of the updater, which React is
  // free to run more than once per commit.
  const itemsRef = useRef<MoodboardItem[]>(items);
  const addErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const write = useCallback(
    (updater: (prev: MoodboardItem[]) => MoodboardItem[]) => {
      setItems((prev) => {
        const next = updater(prev);
        itemsRef.current = next;
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    fetchItems(board)
      .then((loaded) => {
        if (cancelled) return;
        itemsRef.current = loaded;
        setItems(loaded);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [board]);

  useEffect(
    () => () => {
      if (addErrorTimer.current) clearTimeout(addErrorTimer.current);
    },
    [],
  );

  const flashAddError = useCallback(() => {
    if (addErrorTimer.current) clearTimeout(addErrorTimer.current);
    setAddError(ADD_ERROR);
    addErrorTimer.current = setTimeout(() => setAddError(null), ADD_ERROR_MS);
  }, []);

  const add = useCallback(
    (item: MoodboardItem): Promise<boolean> => {
      write((prev) =>
        insert === "append" ? [...prev, item] : sortItems([item, ...prev]),
      );
      return createItem(item)
        .then(() => true)
        .catch(() => {
          write((prev) => prev.filter((i) => i.id !== item.id));
          flashAddError();
          return false;
        });
    },
    [insert, write, flashAddError],
  );

  const remove = useCallback(
    (id: string): Promise<void> => {
      write((prev) => prev.filter((i) => i.id !== id));
      return deleteItem(id).catch(() => {});
    },
    [write],
  );

  const update = useCallback(
    (id: string, patch: ItemPatch) => {
      write((prev) => {
        const next = prev.map((i) => (i.id === id ? applyPatch(i, patch) : i));
        return patch.pinned === undefined ? next : sortItems(next);
      });
      patchItemEdit(id, patch).catch(() => {});
    },
    [write],
  );

  const toggleComplete = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item) return;
      update(id, { completed: !item.completed });
    },
    [update],
  );

  const togglePin = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item) return;
      update(id, { pinned: !item.pinned });
    },
    [update],
  );

  const updateNote = useCallback(
    (id: string, note: string | null) => update(id, { note }),
    [update],
  );

  const replace = useCallback(
    (item: MoodboardItem) => {
      write((prev) => prev.map((i) => (i.id === item.id ? item : i)));
    },
    [write],
  );

  return {
    items,
    loading,
    loadError,
    addError,
    add,
    remove,
    toggleComplete,
    togglePin,
    updateNote,
    update,
    replace,
  };
}
