import { safeFetch } from "./url-safety";
import { extractMetaContent } from "../routes/fetchOg";

// ─────────────────────────────────────────────────────────────────────────────
// Restaurant extraction for District (district.in) dining pages — Zomato's
// dining/events spin-off. Their restaurant pages are server-rendered for SEO and
// carry a complete JSON-LD `Restaurant` block: name, address, geo coordinates,
// cuisines, price-for-two, phone, rating, and opening hours. That block is the
// only source we parse for facts — no CSS-class scraping, which would break on
// every redesign.
//
// Menu pages and ambiance photos aren't in the JSON-LD; they're plain <img> tags
// pointing at Zomato's CDN. They're distinguishable by path prefix alone
// (`/data/menus/` vs `/data/pictures/`), which is what we match on. Those URLs
// are content-hashed asset paths, so we store them as-is rather than downloading
// — a restaurant can have 20+ menu pages, far too much to inline as base64.
// ─────────────────────────────────────────────────────────────────────────────

export interface DistrictPlace {
  name: string;
  address?: string;
  locality?: string;
  lat?: number;
  lng?: number;
  cuisines: string[];
  priceForTwo?: string;
  rating?: number;
  ratingCount?: number;
  phone?: string;
  hours?: string;
  coverImage?: string;
  photos: string[];
  menuImages: string[];
  districtUrl: string;
}

const DISTRICT_HOSTS = new Set(["district.in", "www.district.in"]);

/** District dining pages only. Everything else is rejected before we fetch it —
 *  this endpoint takes a user-supplied URL, so the allowlist comes first. */
export function isDistrictDiningUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (!DISTRICT_HOSTS.has(u.hostname.toLowerCase())) return false;
    return u.pathname.startsWith("/dining/");
  } catch {
    return false;
  }
}

/** The page repeats each image in several `?crop=…&fit=…` variants. Strip the
 *  query to collapse them to one canonical, full-resolution URL. */
function stripQuery(url: string): string {
  const i = url.indexOf("?");
  return i === -1 ? url : url.slice(0, i);
}

function collectCdnImages(html: string, pathPattern: string): string[] {
  const re = new RegExp(
    `https://[a-z]\\.zmtcdn\\.com/data/(?:${pathPattern})/[^"'\\\\\\s)]+`,
    "gi",
  );
  const seen = new Set<string>();
  for (const match of html.match(re) ?? []) {
    const url = stripQuery(match);
    // Trailing backslashes leak in from JSON-escaped strings in inline scripts.
    if (/\.(jpe?g|png|webp)$/i.test(url)) seen.add(url);
  }
  return [...seen];
}

function firstFiniteNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string") return [value];
  return [];
}

const DAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/** Collapse `openingHoursSpecification` into one human line. Almost every
 *  restaurant keeps identical hours all week, so we report the common case
 *  plainly and only fall back to naming days when they actually differ. */
function formatHours(spec: unknown): string | undefined {
  if (!Array.isArray(spec)) return undefined;

  const entries: Array<{ days: string[]; range: string }> = [];
  for (const raw of spec) {
    if (!raw || typeof raw !== "object") continue;
    const s = raw as Record<string, unknown>;
    const opens = typeof s.opens === "string" ? s.opens : undefined;
    const closes = typeof s.closes === "string" ? s.closes : undefined;
    if (!opens || !closes) continue;
    entries.push({ days: toStringArray(s.dayOfWeek), range: `${opens} – ${closes}` });
  }
  if (entries.length === 0) return undefined;

  const ranges = new Set(entries.map((e) => e.range));
  if (ranges.size === 1) return `Daily ${entries[0].range}`;

  return entries
    .slice()
    .sort(
      (a, b) =>
        DAY_ORDER.indexOf(a.days[0] ?? "") - DAY_ORDER.indexOf(b.days[0] ?? ""),
    )
    .map((e) => `${(e.days[0] ?? "").slice(0, 3)} ${e.range}`)
    .join(", ");
}

/** Walk every JSON-LD block and return the first `Restaurant` node. Handles
 *  `@graph` wrappers and `@type` being either a string or an array — the same
 *  shapes `parseJsonLdProduct` in fetchPrice.ts has to deal with. */
function findRestaurantNode(html: string): Record<string, unknown> | null {
  const scriptRe =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRe.exec(html)) !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1].trim());
    } catch {
      continue;
    }
    const roots = Array.isArray(parsed) ? parsed : [parsed];
    for (const root of roots) {
      if (!root || typeof root !== "object") continue;
      const graph = (root as Record<string, unknown>)["@graph"];
      const nodes = Array.isArray(graph) ? graph : [root];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const n = node as Record<string, unknown>;
        const type = n["@type"];
        const types = Array.isArray(type) ? type : [type];
        if (types.includes("Restaurant") || types.includes("FoodEstablishment")) {
          return n;
        }
      }
    }
  }
  return null;
}

export function parseDistrictPlace(html: string, url: string): DistrictPlace | null {
  const node = findRestaurantNode(html);
  if (!node) return null;

  const name = typeof node.name === "string" ? node.name.trim() : "";
  if (!name) return null;

  const address =
    node.address && typeof node.address === "object"
      ? (node.address as Record<string, unknown>)
      : {};
  const geo =
    node.geo && typeof node.geo === "object"
      ? (node.geo as Record<string, unknown>)
      : {};
  const rating =
    node.aggregateRating && typeof node.aggregateRating === "object"
      ? (node.aggregateRating as Record<string, unknown>)
      : {};

  const jsonLdImages = toStringArray(node.image);
  const menuImages = collectCdnImages(html, "menus");
  // Brand logos live under /brand_creatives/ and review shots under
  // /reviews_photos/ — neither is an ambiance photo, so both are left out.
  const galleryImages = collectCdnImages(html, "pictures|dining_catalog");

  const coverImage =
    jsonLdImages.find((img) => !img.includes("/brand_creatives/")) ??
    galleryImages[0] ??
    extractMetaContent(html, "property", "og:image");

  // The cover is shown separately on the card, so don't repeat it in the strip.
  const photos = [...new Set([...jsonLdImages, ...galleryImages])].filter(
    (img) => img !== coverImage && !img.includes("/brand_creatives/"),
  );

  return {
    name,
    address:
      typeof address.streetAddress === "string" ? address.streetAddress : undefined,
    locality:
      typeof address.addressLocality === "string"
        ? address.addressLocality
        : undefined,
    lat: firstFiniteNumber(geo.latitude),
    lng: firstFiniteNumber(geo.longitude),
    cuisines: toStringArray(node.servesCuisine),
    priceForTwo: typeof node.priceRange === "string" ? node.priceRange : undefined,
    rating: firstFiniteNumber(rating.ratingValue),
    ratingCount: firstFiniteNumber(rating.ratingCount),
    phone: typeof node.telephone === "string" ? node.telephone : undefined,
    hours: formatHours(node.openingHoursSpecification),
    coverImage,
    photos,
    menuImages,
    districtUrl: url,
  };
}

export async function fetchDistrictPlace(url: string): Promise<DistrictPlace | null> {
  try {
    const response = await safeFetch(url, {
      // District is India-only; ask for Indian-locale results rather than
      // taking the US default the other callers get.
      headers: { "Accept-Language": "en-IN,en;q=0.9" },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      console.warn(`[district] HTTP ${response.status} for ${url}`);
      return null;
    }
    return parseDistrictPlace(await response.text(), url);
  } catch (err) {
    console.error(`[district] fetch failed for ${url}:`, err);
    return null;
  }
}
