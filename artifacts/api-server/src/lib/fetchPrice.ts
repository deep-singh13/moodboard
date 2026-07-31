import { safeFetch } from "./url-safety";
import { BROWSER_UA, extractMetaContent } from "../routes/fetchOg";

// ─────────────────────────────────────────────────────────────────────────────
// Price + availability extraction for generic product pages. Most e-commerce
// platforms (Shopify, WooCommerce, BigCommerce, etc.) expose a JSON-LD
// `Product`/`Offer` block for SEO — that's the primary source. og:price /
// product:price meta tags are a fallback for sites that skip JSON-LD.
// No Microlink fallback here: its metadata response doesn't reliably include
// price data, so a page with neither JSON-LD nor price meta tags is reported
// as unknown rather than guessed at.
// ─────────────────────────────────────────────────────────────────────────────

export type Availability = "in_stock" | "out_of_stock" | "unknown";

export interface PriceInfo {
  price?: number;
  currency?: string;
  availability?: Availability;
}

export function normalizeAvailability(raw: string | undefined): Availability {
  if (!raw) return "unknown";
  // Strip everything but letters so schema.org URLs ("https://schema.org/InStock"),
  // PascalCase tokens ("OutOfStock"), and OG Product values ("in stock", "out_of_stock")
  // all normalize the same way before matching.
  const v = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (v.includes("outofstock") || v.includes("soldout") || v.includes("discontinued")) {
    return "out_of_stock";
  }
  if (
    v.includes("instock") ||
    v.includes("limitedavailability") ||
    v.includes("preorder") ||
    v.includes("presale") ||
    v.includes("onlineonly")
  ) {
    return "in_stock";
  }
  return "unknown";
}

function firstFiniteNumber(...values: unknown[]): number | undefined {
  for (const v of values) {
    if (v === undefined || v === null || v === "") continue;
    // Strip thousands separators / currency symbols ("1,799.00", "$19.99") —
    // Number() returns NaN on a raw comma-formatted string.
    const cleaned = typeof v === "string" ? v.replace(/[^\d.-]/g, "") : v;
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function offerToPriceInfo(offersRaw: unknown): PriceInfo | undefined {
  const offers = Array.isArray(offersRaw) ? offersRaw[0] : offersRaw;
  if (!offers || typeof offers !== "object") return undefined;
  const o = offers as Record<string, unknown>;

  const price = firstFiniteNumber(o.price, o.lowPrice, o.highPrice);
  if (price === undefined) return undefined;

  return {
    price,
    currency: typeof o.priceCurrency === "string" ? o.priceCurrency : undefined,
    availability: normalizeAvailability(
      typeof o.availability === "string" ? o.availability : undefined,
    ),
  };
}

/** Shopify (and other storefronts) often model a product page as a
 *  `ProductGroup` whose priced/stocked `Offer`s live one level down, on each
 *  `hasVariant` entry — there's no top-level `offers` to read directly. This
 *  picks the cheapest variant's price and reports in-stock if any variant is. */
function variantGroupToPriceInfo(node: Record<string, unknown>): PriceInfo | undefined {
  if (!Array.isArray(node.hasVariant)) return undefined;
  const variantInfos = (node.hasVariant as unknown[])
    .map((v) => (v && typeof v === "object" ? offerToPriceInfo((v as Record<string, unknown>).offers) : undefined))
    .filter((info): info is PriceInfo => !!info);
  if (variantInfos.length === 0) return undefined;

  const cheapest = variantInfos.reduce((min, cur) =>
    (cur.price ?? Infinity) < (min.price ?? Infinity) ? cur : min,
  );
  const anyInStock = variantInfos.some((v) => v.availability === "in_stock");
  const allOutOfStock = variantInfos.every((v) => v.availability === "out_of_stock");

  return {
    price: cheapest.price,
    currency: cheapest.currency,
    availability: anyInStock ? "in_stock" : allOutOfStock ? "out_of_stock" : "unknown",
  };
}

export function parseJsonLdProduct(html: string): PriceInfo {
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
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
      const nodes = Array.isArray((root as Record<string, unknown>)["@graph"])
        ? ((root as Record<string, unknown>)["@graph"] as unknown[])
        : [root];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const n = node as Record<string, unknown>;
        const type = n["@type"];
        const types = Array.isArray(type) ? type : [type];

        if (types.includes("Product")) {
          const info = offerToPriceInfo(n.offers);
          if (info) return info;
        }

        if (types.includes("ProductGroup")) {
          const info = variantGroupToPriceInfo(n);
          if (info) return info;
        }
      }
    }
  }
  return {};
}

export function parseMetaTagPrice(html: string): PriceInfo {
  const priceRaw =
    extractMetaContent(html, "property", "product:price:amount") ??
    extractMetaContent(html, "property", "og:price:amount");
  const currency =
    extractMetaContent(html, "property", "product:price:currency") ??
    extractMetaContent(html, "property", "og:price:currency");
  const availabilityRaw = extractMetaContent(html, "property", "product:availability");

  const price = firstFiniteNumber(priceRaw);
  return {
    price,
    currency,
    availability: normalizeAvailability(availabilityRaw),
  };
}

export function extractPriceInfo(html: string): PriceInfo {
  const jsonLd = parseJsonLdProduct(html);
  if (jsonLd.price !== undefined) return jsonLd;

  const metaTag = parseMetaTagPrice(html);
  if (metaTag.price !== undefined) return metaTag;

  const availability = jsonLd.availability && jsonLd.availability !== "unknown"
    ? jsonLd.availability
    : metaTag.availability;
  return { availability: availability ?? "unknown" };
}

export async function fetchPriceInfo(url: string): Promise<PriceInfo & { fetchFailed?: boolean }> {
  try {
    const response = await safeFetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { fetchFailed: true, availability: "unknown" };
    const html = await response.text();
    return extractPriceInfo(html);
  } catch {
    return { fetchFailed: true, availability: "unknown" };
  }
}
