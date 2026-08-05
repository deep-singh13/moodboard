import { Router, type IRouter } from "express";
import { pool } from "../lib/db";
import { fetchDistrictPlace, isDistrictDiningUrl } from "../lib/districtPlace";
import { compressToWebPDataUrl } from "./fetchOg";

const router: IRouter = Router();

const MAX_RESULTS = 8;
const MIN_QUERY_LENGTH = 2;

/** `cafe-delhi-heights-khan-market-new-delhi` → `Cafe Delhi Heights Khan Market
 *  New Delhi`. Only used to label search results — the authoritative name and
 *  address come from the page scrape once a result is picked. */
function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) =>
      /^\d+$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

// GET /api/place-search?q=<name>
// Searches the locally ingested District restaurant index (see
// scripts/src/ingestDistrictPlaces.ts). Returns up to 8 candidates.
router.get("/place-search", async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  if (!q || q.length < MIN_QUERY_LENGTH) {
    res.json([]);
    return;
  }

  try {
    // name_text is stored pre-lowercased with hyphens as spaces, so a plain
    // substring match works. At ~37k rows the sequential scan is well under
    // 50ms, which is why there's no pg_trgm dependency here.
    const needle = q.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!needle) {
      res.json([]);
      return;
    }

    const result = await pool.query(
      `SELECT slug, city, url, name_text
         FROM district_places
        WHERE name_text LIKE '%' || $1 || '%'
        ORDER BY position($1 IN name_text) ASC, length(name_text) ASC
        LIMIT $2`,
      [needle, MAX_RESULTS],
    );

    res.json(
      result.rows.map((row: Record<string, unknown>) => {
        const slug = String(row.slug);
        return {
          slug,
          city: row.city,
          url: row.url,
          // Slug is `<city>/<name>-<locality>-<city>`; label only the second half.
          label: humanizeSlug(slug.split("/").slice(1).join("/")),
        };
      }),
    );
  } catch (err) {
    console.error("[place-search] query failed:", err);
    res.json([]);
  }
});

// GET /api/place-detail?url=<district dining url>
// Scrapes a District restaurant page for location, menu pages, and photos.
// Shared by both the paste-a-link flow and the search-then-select flow.
router.get("/place-detail", async (req, res) => {
  const url = (req.query.url as string | undefined)?.trim();
  if (!url) {
    res.status(400).json({ error: "url query parameter is required" });
    return;
  }
  if (!isDistrictDiningUrl(url)) {
    res.status(400).json({ error: "Not a District dining URL" });
    return;
  }

  const place = await fetchDistrictPlace(url);
  if (!place) {
    res.status(502).json({ error: "Couldn't read that District page" });
    return;
  }

  // Only the card cover is downloaded and inlined. Menu pages and the photo
  // strip stay as Zomato CDN URLs — 20+ base64 images per place would bloat
  // both the row and the save request past any reasonable limit.
  const cover = place.coverImage
    ? await compressToWebPDataUrl(place.coverImage)
    : null;

  res.json({ ...place, coverImage: cover ?? place.coverImage });
});

export default router;
