// clsx rather than the local cn(): cn runs tailwind-merge, which exists to
// resolve conflicting Tailwind utilities. These are plain project class names,
// so merging is wasted work and would misfire if one ever looked like a
// Tailwind group. The original component uses clsx for the same reason.
import clsx from "clsx";

// ─────────────────────────────────────────────────────────────────────────────
// Adapted from KokonutUI's Morphic Navbar. The mechanic is theirs: the items
// form one continuous track, and the active item detaches into a floating pill
// while its neighbours round the edge they present to the gap.
//
// Three things had to change to work here:
//   - next/link → button. This app is a Vite SPA with no router; tabs swap an
//     in-page view rather than navigating, so a button with aria-current is the
//     honest element. (The original's links are href="#" anyway.)
//   - Tailwind classes → real CSS. index.css has no Tailwind entry, so utility
//     classes emit nothing here. Styles live in the MORPHIC TABS block there.
//   - internal useState → controlled props. The active tab already lives in
//     moodboard.tsx and drives which page renders, so a second copy of that
//     state would immediately drift.
//
// Items are an ordered array rather than the original's keyed object — this is
// an ordered list, and object key order is a fragile thing to lean on.
// ─────────────────────────────────────────────────────────────────────────────

export interface MorphicTabItem<T extends string> {
  id: T;
  label: string;
}

interface MorphicTabsProps<T extends string> {
  items: ReadonlyArray<MorphicTabItem<T>>;
  activeId: T;
  onSelect: (id: T) => void;
  /** Names the nav for screen readers. */
  label: string;
  className?: string;
}

export function MorphicTabs<T extends string>({
  items,
  activeId,
  onSelect,
  label,
  className,
}: MorphicTabsProps<T>) {
  return (
    <nav className={clsx("morphic-tabs", className)} aria-label={label}>
      {items.map((item, i) => {
        const isActive = item.id === activeId;
        // Round the edge facing the gap the active pill opened up — plus the
        // two outer ends, which are always round.
        const roundLeft = i === 0 || items[i - 1]?.id === activeId;
        const roundRight = i === items.length - 1 || items[i + 1]?.id === activeId;

        return (
          <button
            key={item.id}
            type="button"
            aria-current={isActive ? "true" : undefined}
            className={clsx(
              "morphic-tab",
              isActive && "is-active",
              !isActive && roundLeft && "round-left",
              !isActive && roundRight && "round-right",
            )}
            onClick={() => onSelect(item.id)}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

export default MorphicTabs;
