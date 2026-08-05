import { gunzipSync } from "node:zlib";
import { pool } from "./db";
import { BROWSER_UA } from "../routes/fetchOg";
import { logger } from "./logger";

// ─────────────────────────────────────────────────────────────────────────────
// Populates `district_places` from District's public dining sitemap so the
// Places tab can offer name search locally.
//
// Why a local index rather than calling District's search: their search API
// (POST /gw/web/search) is auth-gated behind a private guest token, and their
// /search page is a client-rendered shell with no results in the HTML. The
// sitemap is the one interface they publish for this.
//
// This runs itself on boot — see ensureDistrictIndex() — so a deploy needs no
// manual step. The sitemap holds ~450k restaurants across India, so by default
// only Delhi NCR (~37k) is kept. Set DISTRICT_INGEST_CITIES to a comma-separated
// list to widen it (e.g. `ncr,mumbai,bangalore`); the next boot notices the new
// city has no rows and ingests just that one.
// ─────────────────────────────────────────────────────────────────────────────

const SITEMAP_INDEX =
  "https://www.district.in/dining/search-sitemap/sitemap-dining.xml";
const BATCH_SIZE = 1000;
const FETCH_TIMEOUT_MS = 60000;

interface PlaceRow {
  slug: string;
  city: string;
  nameText: string;
  url: string;
}

export function targetCities(): Set<string> {
  const raw = process.env.DISTRICT_INGEST_CITIES ?? "ncr";
  return new Set(
    raw
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { "User-Agent": BROWSER_UA },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function extractLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

/** `https://www.district.in/dining/ncr/cafe-delhi-heights-khan-market-new-delhi`
 *  → city `ncr`, slug `ncr/cafe-delhi-heights-khan-market-new-delhi`,
 *    nameText `cafe delhi heights khan market new delhi`. */
export function toRow(url: string, cities: Set<string>): PlaceRow | null {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  if (!path.startsWith("/dining/")) return null;

  const parts = path.slice("/dining/".length).split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const [city, ...rest] = parts;
  if (!cities.has(city.toLowerCase())) return null;

  // Skip sub-pages like `.../slug/book` — we only want the restaurant page.
  if (rest.length > 1) return null;

  const nameText = rest[0].replace(/-/g, " ").toLowerCase();
  return { slug: `${city}/${rest[0]}`, city, nameText, url };
}

async function insertBatch(rows: PlaceRow[]): Promise<void> {
  if (rows.length === 0) return;
  const values: string[] = [];
  const params: string[] = [];
  rows.forEach((row, i) => {
    const b = i * 4;
    values.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4})`);
    params.push(row.slug, row.city, row.nameText, row.url);
  });
  await pool.query(
    `INSERT INTO district_places (slug, city, name_text, url)
     VALUES ${values.join(", ")}
     ON CONFLICT (slug) DO NOTHING`,
    params,
  );
}

export async function ingestDistrictPlaces(cities: Set<string>): Promise<number> {
  const index = (await fetchBuffer(SITEMAP_INDEX)).toString("utf8");
  const chunkUrls = extractLocs(index);
  logger.info({ chunks: chunkUrls.length }, "District sitemap index fetched");

  let matched = 0;

  // Every chunk is scanned rather than assuming a city sits in a known one —
  // District is free to re-shard these at any time. Only ~7MB gzipped in total,
  // and each chunk is decompressed and discarded one at a time to keep the
  // footprint small on a modest instance.
  for (const [i, chunkUrl] of chunkUrls.entries()) {
    const raw = await fetchBuffer(chunkUrl);
    const xml = (chunkUrl.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8");

    const rows: PlaceRow[] = [];
    for (const loc of extractLocs(xml)) {
      const row = toRow(loc, cities);
      if (row) rows.push(row);
    }

    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      await insertBatch(rows.slice(start, start + BATCH_SIZE));
    }
    matched += rows.length;
    if (rows.length > 0) {
      logger.info(
        { chunk: `${i + 1}/${chunkUrls.length}`, added: rows.length, total: matched },
        "District sitemap chunk ingested",
      );
    }
  }

  return matched;
}

/**
 * Boot hook: ingest any configured city that has no rows yet, then stop.
 *
 * Deliberately keyed on per-city row counts rather than a "has this ever run"
 * flag. That makes it a no-op on every ordinary restart (which matters on a
 * free instance that sleeps and cold-starts often), while still picking up a
 * newly added city in DISTRICT_INGEST_CITIES without any manual step.
 *
 * Never throws: a District outage must not stop the server from serving
 * everything else.
 */
export async function ensureDistrictIndex(): Promise<void> {
  try {
    const cities = targetCities();
    if (cities.size === 0) return;

    const { rows } = await pool.query(
      `SELECT city, count(*)::int AS n FROM district_places GROUP BY city`,
    );
    const counts = new Map(
      (rows as Array<{ city: string; n: number }>).map((r) => [r.city, r.n]),
    );

    const missing = new Set([...cities].filter((c) => (counts.get(c) ?? 0) === 0));
    if (missing.size === 0) {
      logger.info(
        { cities: [...cities].join(",") },
        "District index already populated — skipping ingest",
      );
      return;
    }

    logger.info(
      { cities: [...missing].join(",") },
      "District index empty for these cities — ingesting from sitemap",
    );
    const started = Date.now();
    const total = await ingestDistrictPlaces(missing);
    logger.info(
      { rows: total, seconds: Math.round((Date.now() - started) / 1000) },
      "District index ingest complete",
    );
  } catch (err) {
    logger.error({ err }, "District index ingest failed — Places name search will be empty until the next restart");
  }
}
