import { useRef, type ReactNode, type RefObject } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import type { MoodboardItem } from "@/types";
import { useMinWidth } from "@/lib/gridUtils";

const DRIFT_PX = 28;

interface ParallaxColumnsProps {
  columns: MoodboardItem[][];
  renderItem: (item: MoodboardItem) => ReactNode;
  /** The scrollable ancestor (`.discover-page`, which owns `overflow-y: auto`) to track. */
  scrollContainerRef: RefObject<HTMLElement | null>;
}

/**
 * Masonry columns for Discover/Places, with a scroll-linked vertical drift
 * on desktop/tablet. Below the site's 640px column-count breakpoint, or
 * under prefers-reduced-motion, this renders identically to a plain static
 * masonry — no scroll listener, no transform.
 */
export function ParallaxColumns({ columns, renderItem, scrollContainerRef }: ParallaxColumnsProps) {
  const reducedMotion = useReducedMotion();
  const wide = useMinWidth(640);
  const enabled = !reducedMotion && wide;

  if (!enabled) {
    return (
      <div className="discover-masonry">
        {columns.map((col, ci) => (
          <div key={ci} className="discover-col">
            {col.map(renderItem)}
          </div>
        ))}
      </div>
    );
  }

  return <ParallaxMasonry columns={columns} renderItem={renderItem} scrollContainerRef={scrollContainerRef} />;
}

function ParallaxMasonry({ columns, renderItem, scrollContainerRef }: ParallaxColumnsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    container: scrollContainerRef,
    target: containerRef,
    offset: ["start end", "end start"],
  });

  return (
    <div className="discover-masonry" ref={containerRef}>
      {columns.map((col, ci) => (
        <ParallaxColumn key={ci} items={col} renderItem={renderItem} index={ci} progress={scrollYProgress} />
      ))}
    </div>
  );
}

function ParallaxColumn({
  items,
  renderItem,
  index,
  progress,
}: {
  items: MoodboardItem[];
  renderItem: (item: MoodboardItem) => ReactNode;
  index: number;
  progress: ReturnType<typeof useScroll>["scrollYProgress"];
}) {
  const drift = index % 2 === 0 ? DRIFT_PX : -DRIFT_PX;
  const y = useTransform(progress, [0, 1], [-drift, drift]);
  return (
    <motion.div className="discover-col" style={{ y }}>
      {items.map(renderItem)}
    </motion.div>
  );
}
