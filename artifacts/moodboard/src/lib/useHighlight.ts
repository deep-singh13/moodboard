import { useCallback, useEffect, useRef, useState } from "react";

/* ---------------------------------------------------------------------------
 * Why this is separate from useBoard
 *
 * Picking a Spotlight result has to do two unrelated things: scroll the card
 * into view, and flash it so the eye can find it once it arrives. That is a
 * view concern, not a board concern — it touches the DOM and nothing else, and
 * the same board can be rendered by a tab that does not scroll at all.
 *
 * It is also separate from the Board tab's version, which pans the infinite
 * canvas with its own eased rAF loop and doubles as the Surprise Me target.
 * Folding both behind one interface would mean a mode flag selecting between
 * two implementations that share no code; two small modules is the smaller
 * total interface.
 *
 * The scope selector is a parameter because Quotes and Discover both render
 * inside `.discover-page` while Places renders inside `.places-page`, and a
 * card id is only unique within its own tab.
 * ------------------------------------------------------------------------ */

/** How long a picked card stays flashed. Matches the CSS pulse. */
const HIGHLIGHT_MS = 1800;

export interface Highlight {
  /** The currently flashed item, or null. Pass to a card as `isHighlighted`. */
  highlightId: string | null;
  /** Scroll the item's card into view and flash it. */
  highlight(id: string): void;
}

export function useHighlight(
  scopeSelector: string,
  durationMs: number = HIGHLIGHT_MS,
): Highlight {
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const highlight = useCallback(
    (id: string) => {
      if (timer.current) clearTimeout(timer.current);
      setHighlightId(id);
      // The card may not be mounted yet when the picker closes, so wait a frame
      // before looking for it.
      requestAnimationFrame(() => {
        document
          .querySelector(`${scopeSelector} [data-item-id="${id}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      timer.current = setTimeout(() => setHighlightId(null), durationMs);
    },
    [scopeSelector, durationMs],
  );

  return { highlightId, highlight };
}
