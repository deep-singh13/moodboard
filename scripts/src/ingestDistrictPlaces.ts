import "dotenv/config";
import { gunzipSync } from "node:zlib";
import pg from "pg";

// ─────────────────────────────────────────────────────────────────────────────
// Populates the `district_places` table from District's public dining sitemap,
// so the Places tab can offer name search locally.
//
// Why a local index rather than calling District's search: their search API
// (POST /gw/web/search) is auth-gated behind a private guest token, and their
// /search page is a client-rendered shell with no results in the HTML. The
// sitemap is the one interface they publish for exactly this purpose.
//
// The sitemap holds ~450k restaurants across India, so by default we keep only
// Delhi NCR (~37k). Set DISTRICT_INGEST_CITIES to a comma-separated list to
// widen it — e.g. `ncr,mumbai,bangalore` — then re-run. Re-running is safe and
// incremental: existing slugs are left alone.
//
//   pnpm --filter @workspace/scripts run ingest-places
// ─────────────────────────────────────────────────────────────────────────────

const SITEMAP_INDEX = "https://www.district.in/dining/search-sitemap/sitemap-dining.xml";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BATCH_SIZE = 1000;

interface PlaceRow {
  slug: string;
  city: string;
  nameText: string;
  url: string;
}

function targetCities(): Set<string> {
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
    signal: AbortSignal.timeout(60000),
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
function toRow(url: string, cities: Set<string>): PlaceRow | null {
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

async function insertBatch(pool: pg.Pool, rows: PlaceRow[]): Promise<void> {
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

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required.");
  }

  const cities = targetCities();
  console.log(`Ingesting District restaurants for: ${[...cities].join(", ")}`);

  const pool = new pg.Pool({
    connectionString,
    ssl: connectionString.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  // The table is normally created by the api-server's initDb(), but the ingest
  // may well run first on a fresh database.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS district_places (
      slug      TEXT PRIMARY KEY,
      city      TEXT NOT NULL,
      name_text TEXT NOT NULL,
      url       TEXT NOT NULL
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS district_places_city_idx ON district_places (city)`,
  );

  const index = (await fetchBuffer(SITEMAP_INDEX)).toString("utf8");
  const chunkUrls = extractLocs(index);
  console.log(`Sitemap index lists ${chunkUrls.length} chunks`);

  let matched = 0;

  // Every chunk is scanned rather than assuming a city sits in a known one —
  // District is free to re-shard these at any time. It's only ~7MB gzipped total.
  for (const [i, chunkUrl] of chunkUrls.entries()) {
    const raw = await fetchBuffer(chunkUrl);
    const xml = (chunkUrl.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8");

    const rows: PlaceRow[] = [];
    for (const loc of extractLocs(xml)) {
      const row = toRow(loc, cities);
      if (row) rows.push(row);
    }

    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      await insertBatch(pool, rows.slice(start, start + BATCH_SIZE));
    }
    matched += rows.length;
    console.log(
      `  chunk ${i + 1}/${chunkUrls.length}: ${rows.length} matching (${matched} total)`,
    );
  }

  const { rows: counts } = await pool.query(
    `SELECT city, count(*)::int AS n FROM district_places GROUP BY city ORDER BY n DESC`,
  );
  console.log("\nRows in district_places:");
  for (const c of counts) console.log(`  ${c.city}: ${c.n}`);

  await pool.end();
}

main().catch((err) => {
  console.error("Ingest failed:", err);
  process.exit(1);
});
