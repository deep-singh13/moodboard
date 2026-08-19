import type { MoodboardItem, PlaceMeta } from "@/types";

/* ---------------------------------------------------------------------------
 * Why `meta` gets a codec instead of a JSON.parse at each call site
 *
 * `meta` is one TEXT column shared by every item type, so the database cannot
 * describe what is in it and the server deliberately treats it as opaque. That
 * left five readers each doing the same try/parse/fall-back-to-{} dance and
 * then trusting the result — two of them via an unchecked `as PlaceMeta`. The
 * shapes genuinely differ, and they collide: `rating` is a string on a movie
 * (OMDB gives "7.8") and a number on a place, where PlaceCard calls
 * `.toFixed(1)` on it. One bad row was all it took to throw.
 *
 * Hence one decoder per type rather than a single `decodeMeta` returning a
 * union: every card receives a plain MoodboardItem, so TypeScript cannot narrow
 * a union off `item.type` at the call site, and a shared decoder would push a
 * narrowing check into all five readers. A caller always knows which kind of
 * card it is; asking it to say so costs nothing and buys an exact type.
 *
 * Decoding never throws and never reports failure. A moodboard should render a
 * slightly incomplete card rather than an error state — but every field is
 * type-checked on the way out, so a wrong-typed value becomes absent instead of
 * becoming a crash two components later.
 *
 * Encoding merges into the *raw* stored object rather than into the decoded
 * one. That is deliberate: it preserves keys this module does not know about,
 * so editing a quote's colour cannot silently delete fields that some older
 * version wrote — which is exactly the bug this replaces.
 * ------------------------------------------------------------------------ */

/** The stored `meta` of a saved quote. */
export interface QuoteMeta {
  color: string;
}

/** The stored `meta` of a saved movie. `rating` is OMDB's string, not a number. */
export interface MovieMeta {
  imdbId?: string;
  year?: string;
  genre?: string;
  rating?: string;
  director?: string;
}

/** The stored `meta` of a saved Instagram reel. */
export interface ReelMeta {
  username?: string;
  reel_url?: string;
}

/** Fallback when a quote has no colour stored. */
export const DEFAULT_QUOTE_COLOR = "bleached-apricot";

/** Just enough of an item to read its meta — keeps the codec testable without
 *  constructing a whole MoodboardItem. */
type HasMeta = Pick<MoodboardItem, "meta">;

function parseObject(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    // Arrays and primitives are valid JSON but never a valid meta payload.
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Keeps only the string entries, so one bad element can't poison a gallery. */
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Merges a patch into whatever is already stored, dropping undefined values.
 *  Unknown keys in `current` survive untouched. */
function merge(patch: Record<string, unknown>, current?: string): string {
  const merged = parseObject(current);
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) merged[key] = value;
  }
  return JSON.stringify(merged);
}

/* -- quote ---------------------------------------------------------------- */

export function decodeQuoteMeta(item: HasMeta): QuoteMeta {
  const raw = parseObject(item.meta);
  return { color: str(raw.color) ?? DEFAULT_QUOTE_COLOR };
}

export function encodeQuoteMeta(
  patch: Partial<QuoteMeta>,
  current?: string,
): string {
  return merge({ ...patch }, current);
}

/* -- movie ---------------------------------------------------------------- */

export function decodeMovieMeta(item: HasMeta): MovieMeta {
  const raw = parseObject(item.meta);
  return {
    imdbId: str(raw.imdbId),
    year: str(raw.year),
    genre: str(raw.genre),
    rating: str(raw.rating),
    director: str(raw.director),
  };
}

export function encodeMovieMeta(
  patch: Partial<MovieMeta>,
  current?: string,
): string {
  return merge({ ...patch }, current);
}

/* -- reel ----------------------------------------------------------------- */

export function decodeReelMeta(item: HasMeta): ReelMeta {
  const raw = parseObject(item.meta);
  return {
    username: str(raw.username),
    reel_url: str(raw.reel_url),
  };
}

export function encodeReelMeta(
  patch: Partial<ReelMeta>,
  current?: string,
): string {
  return merge({ ...patch }, current);
}

/* -- place ---------------------------------------------------------------- */

/** What `decodePlaceMeta` guarantees: the three list fields are always present,
 *  so callers stop writing `meta.photos ?? []` at every use. */
export type DecodedPlaceMeta = Omit<
  PlaceMeta,
  "cuisines" | "photos" | "menuImages"
> & {
  cuisines: string[];
  photos: string[];
  menuImages: string[];
};

export function decodePlaceMeta(item: HasMeta): DecodedPlaceMeta {
  const raw = parseObject(item.meta);
  const source = raw.source;
  return {
    address: str(raw.address),
    locality: str(raw.locality),
    lat: num(raw.lat),
    lng: num(raw.lng),
    mapsUrl: str(raw.mapsUrl),
    cuisines: strings(raw.cuisines),
    priceForTwo: str(raw.priceForTwo),
    rating: num(raw.rating),
    ratingCount: num(raw.ratingCount),
    phone: str(raw.phone),
    hours: str(raw.hours),
    photos: strings(raw.photos),
    menuImages: strings(raw.menuImages),
    source: source === "district" || source === "manual" ? source : undefined,
  };
}

export function encodePlaceMeta(
  patch: Partial<PlaceMeta>,
  current?: string,
): string {
  return merge({ ...patch }, current);
}
