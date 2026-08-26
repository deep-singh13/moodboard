import { useState, useEffect } from "react";
import type { MoodboardItem, PlaceMeta } from "@/types";

/** Reactive `window.innerWidth >= px`, updated on resize. */
export function useMinWidth(px: number): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== "undefined" ? window.innerWidth >= px : true));
  useEffect(() => {
    const update = () => setMatches(window.innerWidth >= px);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [px]);
  return matches;
}

/** Column count for the masonry grids on Discover and Places. */
export function useColumnCount(): number {
  const [cols, setCols] = useState(() => {
    const w = typeof window !== "undefined" ? window.innerWidth : 1200;
    return w < 640 ? 2 : w < 1024 ? 3 : 4;
  });
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setCols(w < 640 ? 2 : w < 1024 ? 3 : 4);
    };
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return cols;
}

/** Pinned first, then newest first. */
export function sortItems(items: MoodboardItem[]): MoodboardItem[] {
  return [...items].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
  });
}

/** Distributes items round-robin into `numCols` masonry columns. */
export function toColumns(
  items: MoodboardItem[],
  numCols: number,
): MoodboardItem[][] {
  const columns: MoodboardItem[][] = Array.from({ length: numCols }, () => []);
  items.forEach((item, i) => columns[i % numCols].push(item));
  return columns;
}

/**
 * Google Maps universal link for a saved place.
 *
 * Coordinates are strongly preferred over a name search: chains like Cafe Delhi
 * Heights have half a dozen NCR branches, and a name query would happily open
 * the wrong one. Lat/lng always resolves to the exact place that was picked.
 *
 * This `?api=1` form is Google's documented Maps URL scheme — on iOS and Android
 * it hands off to the installed Google Maps app, and on desktop it opens
 * maps.google.com.
 */
export function buildMapsUrl(
  meta: Pick<PlaceMeta, "lat" | "lng" | "address">,
  name?: string,
): string | undefined {
  const base = "https://www.google.com/maps/search/?api=1&query=";

  if (typeof meta.lat === "number" && typeof meta.lng === "number") {
    return `${base}${meta.lat},${meta.lng}`;
  }

  // Manual entries may have only a typed address — less precise, but still
  // opens the app on the right search.
  const textQuery = [name, meta.address].filter(Boolean).join(", ");
  if (textQuery) return `${base}${encodeURIComponent(textQuery)}`;

  return undefined;
}
