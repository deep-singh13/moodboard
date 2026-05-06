import { Router, type IRouter } from "express";

const router: IRouter = Router();

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ── YouTube helpers ───────────────────────────────────────────────────────────

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname;
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    const v = u.searchParams.get("v");
    if (v) return v;
    const match = u.pathname.match(/\/(?:shorts|embed)\/([^/?]+)/);
    if (match) return match[1];
  } catch {}
  return null;
}

async function fetchYouTubeMeta(url: string, videoId: string): Promise<{
  title?: string;
  description?: string;
  image?: string;
}> {
  const thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`,
    )}&format=json`;
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = (await res.json()) as { title?: string; author_name?: string };
      return {
        title: data.title,
        description: data.author_name ? `by ${data.author_name}` : undefined,
        image: thumbnail,
      };
    }
  } catch {}
  return { image: thumbnail };
}

// ── Instagram thumbnail fetching ──────────────────────────────────────────────
//
// Meta's oEmbed API requires App Review (code 10) — not viable for a new app.
// Direct scraping returns the generic app logo from datacenter IPs.
//
// Solution: RapidAPI Instagram Scraper routes requests through residential
// proxies, so Instagram can't block them. Free tier = 500 req/month.
//
// Setup (one-time, 2 minutes):
//   1. Sign up at https://rapidapi.com (free)
//   2. Search "Instagram Scraper" → subscribe to the free plan
//   3. Copy your RapidAPI key
//   4. Add RAPIDAPI_KEY=<your_key> to Render environment variables

function isInstagramUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "www.instagram.com" || host === "instagram.com";
  } catch {
    return false;
  }
}

/** Download an image URL and return it as a base64 data URL for permanent storage.
 *  Instagram CDN URLs expire after ~24-72 hours — base64 lasts forever. */
async function downloadAsDataUrl(imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.error(`[instagram] thumbnail download failed: HTTP ${res.status}`);
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    console.log(`[instagram] thumbnail downloaded: ${buffer.byteLength} bytes, type=${contentType}`);
    return `data:${contentType};base64,${base64}`;
  } catch (err) {
    console.error(`[instagram] thumbnail download error: ${err}`);
    return null;
  }
}

/** Extract the best thumbnail candidate from a RapidAPI Instagram post response. */
function extractRapidApiThumbnail(data: Record<string, unknown>): string | null {
  // Most scrapers nest data under data.data or data directly
  const root = (data.data ?? data) as Record<string, unknown>;

  // Post/reel item may be at root.items[0] or root.item or root directly
  const itemsArr = Array.isArray(root.items) ? root.items : null;
  const item = (itemsArr?.[0] ?? root.item ?? root) as Record<string, unknown> | null;
  if (!item) return null;

  // image_versions2.candidates → sorted largest first
  const candidates = (item.image_versions2 as Record<string, unknown> | undefined)
    ?.candidates as Array<{ url?: string; width?: number }> | undefined;
  if (candidates?.length) {
    // Pick the widest candidate (first is usually largest)
    return (candidates[0].url as string) ?? null;
  }

  // Carousel media: first node's thumbnail
  const carouselMedia = item.carousel_media as Array<Record<string, unknown>> | undefined;
  if (carouselMedia?.length) {
    const first = carouselMedia[0];
    const c2 = (first.image_versions2 as Record<string, unknown> | undefined)
      ?.candidates as Array<{ url?: string }> | undefined;
    if (c2?.[0]?.url) return c2[0].url as string;
  }

  // Some APIs return thumbnail_url directly
  if (typeof item.thumbnail_url === "string") return item.thumbnail_url;
  if (typeof (root as Record<string, unknown>).thumbnail_url === "string") {
    return (root as Record<string, unknown>).thumbnail_url as string;
  }

  return null;
}

/** Extract username from a RapidAPI Instagram post response. */
function extractRapidApiAuthor(data: Record<string, unknown>): string | null {
  const root = (data.data ?? data) as Record<string, unknown>;
  const itemsArr = Array.isArray(root.items) ? root.items : null;
  const item = (itemsArr?.[0] ?? root.item ?? root) as Record<string, unknown> | null;
  const user = item?.user as Record<string, unknown> | undefined;
  return (user?.username as string) ?? null;
}

async function fetchInstagramMeta(url: string): Promise<{
  title?: string;
  image?: string;
  fetchFailed?: boolean;
}> {
  const rapidApiKey = process.env.RAPIDAPI_KEY;

  if (!rapidApiKey) {
    console.error("[instagram] RAPIDAPI_KEY not set — see setup instructions in fetchOg.ts");
    return { fetchFailed: true };
  }

  console.log(`[instagram] fetching via RapidAPI: ${url}`);

  // Extract shortcode to support both /reel/ and /p/ URLs
  const shortcodeMatch = url.match(/instagram\.com\/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
  const shortcodeOrUrl = shortcodeMatch?.[1] ?? url;

  const apiUrl = `https://instagram-scraper-api2.p.rapidapi.com/v1/post_info?code_or_id_or_url=${encodeURIComponent(shortcodeOrUrl)}`;

  try {
    const res = await fetch(apiUrl, {
      headers: {
        "X-RapidAPI-Key": rapidApiKey,
        "X-RapidAPI-Host": "instagram-scraper-api2.p.rapidapi.com",
      },
      signal: AbortSignal.timeout(12000),
    });

    const body = await res.text();

    if (!res.ok) {
      console.error(`[instagram] RapidAPI HTTP ${res.status}: ${body.slice(0, 300)}`);
      return { fetchFailed: true };
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body) as Record<string, unknown>;
    } catch {
      console.error(`[instagram] RapidAPI non-JSON response: ${body.slice(0, 300)}`);
      return { fetchFailed: true };
    }

    console.log(`[instagram] RapidAPI raw response keys: ${Object.keys(data).join(", ")}`);

    const thumbnailUrl = extractRapidApiThumbnail(data);
    const author = extractRapidApiAuthor(data);

    console.log(`[instagram] thumbnail_url=${thumbnailUrl ?? "none"}, author=${author ?? "none"}`);

    if (!thumbnailUrl) {
      console.warn("[instagram] RapidAPI returned no usable thumbnail");
      return { title: author ? `@${author}` : undefined, fetchFailed: true };
    }

    // Download immediately — CDN URLs from Instagram expire in ~24-72 hrs
    const dataUrl = await downloadAsDataUrl(thumbnailUrl);
    return {
      title: author ? `@${author}` : undefined,
      image: dataUrl ?? thumbnailUrl,
    };
  } catch (err) {
    console.error(`[instagram] RapidAPI fetch threw: ${err}`);
    return { fetchFailed: true };
  }
}

// ── Generic OG scraper ────────────────────────────────────────────────────────

function extractMetaContent(
  html: string,
  attr: "property" | "name",
  value: string,
): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]+${attr}=["']${value}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${value}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)));
}

function toAbsoluteUrl(href: string, base: string): string {
  try { return new URL(href, base).toString(); } catch { return ""; }
}

function isLikelyImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      (u.protocol === "http:" || u.protocol === "https:") &&
      /\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(u.pathname)
    );
  } catch {
    return false;
  }
}

function parseOgTags(
  html: string,
  baseUrl: string,
): { title?: string; description?: string; image?: string } {
  const titleFallback = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  const rawTitle =
    extractMetaContent(html, "property", "og:title") ??
    extractMetaContent(html, "name", "twitter:title") ??
    titleFallback;
  const rawDescription =
    extractMetaContent(html, "property", "og:description") ??
    extractMetaContent(html, "name", "description");

  let image: string | undefined =
    extractMetaContent(html, "property", "og:image") ??
    extractMetaContent(html, "property", "og:image:url") ??
    extractMetaContent(html, "name", "twitter:image") ??
    extractMetaContent(html, "name", "twitter:image:src");

  if (!image) {
    const m =
      html.match(/<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i) ??
      html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon["']/i);
    if (m?.[1]) {
      const abs = toAbsoluteUrl(m[1], baseUrl);
      if (isLikelyImageUrl(abs)) image = abs;
    }
  }

  if (!image) {
    const imgRe = /<img\b([^>]+)>/gi;
    let m: RegExpExecArray | null;
    while ((m = imgRe.exec(html)) !== null) {
      const attrs = m[1];
      const src = attrs.match(/\bsrc=["']([^"']+)["']/i)?.[1];
      if (!src) continue;
      const w = parseInt(attrs.match(/\bwidth=["']?(\d+)/i)?.[1] ?? "0", 10);
      const h = parseInt(attrs.match(/\bheight=["']?(\d+)/i)?.[1] ?? "0", 10);
      if (w >= 200 || h >= 200) {
        const abs = toAbsoluteUrl(src, baseUrl);
        if (isLikelyImageUrl(abs)) { image = abs; break; }
      }
    }
  }

  return {
    title: rawTitle ? decodeHtmlEntities(rawTitle) : undefined,
    description: rawDescription ? decodeHtmlEntities(rawDescription) : undefined,
    image,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/fetch-og", async (req, res) => {
  const url = req.query.url as string | undefined;
  if (!url) {
    res.status(400).json({ error: "url query parameter is required" });
    return;
  }

  if (isInstagramUrl(url)) {
    const meta = await fetchInstagramMeta(url);
    res.json(meta);
    return;
  }

  const videoId = extractYouTubeId(url);
  if (videoId) {
    const meta = await fetchYouTubeMeta(url, videoId);
    res.json(meta);
    return;
  }

  try {
    const response = await fetch(url, {
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

    if (!response.ok) {
      res.json({ fetchFailed: true });
      return;
    }

    const html = await response.text();
    res.json(parseOgTags(html, url));
  } catch {
    res.json({ fetchFailed: true });
  }
});

/**
 * Debug endpoint — call this to see exactly what RapidAPI returns for an
 * Instagram URL without adding a card to the moodboard.
 *
 * Usage: GET /api/debug-instagram?url=https://www.instagram.com/reel/ABC123/
 */
router.get("/debug-instagram", async (req, res) => {
  const url = req.query.url as string | undefined;
  if (!url) {
    res.status(400).json({ error: "url query parameter is required" });
    return;
  }

  const rapidApiKey = process.env.RAPIDAPI_KEY;

  const diagnosis: Record<string, unknown> = {
    url,
    RAPIDAPI_KEY_set: !!rapidApiKey,
    key_preview: rapidApiKey ? `${rapidApiKey.slice(0, 8)}...` : null,
  };

  if (!rapidApiKey) {
    res.json({ ...diagnosis, error: "RAPIDAPI_KEY not set in environment" });
    return;
  }

  const shortcodeMatch = url.match(/instagram\.com\/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
  const shortcodeOrUrl = shortcodeMatch?.[1] ?? url;
  const apiUrl = `https://instagram-scraper-api2.p.rapidapi.com/v1/post_info?code_or_id_or_url=${encodeURIComponent(shortcodeOrUrl)}`;

  diagnosis.shortcode = shortcodeOrUrl;
  diagnosis.api_url_called = apiUrl;

  try {
    const apiRes = await fetch(apiUrl, {
      headers: {
        "X-RapidAPI-Key": rapidApiKey,
        "X-RapidAPI-Host": "instagram-scraper-api2.p.rapidapi.com",
      },
      signal: AbortSignal.timeout(12000),
    });
    const body = await apiRes.text();
    diagnosis.http_status = apiRes.status;
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      diagnosis.api_response_keys = Object.keys(parsed);
      diagnosis.thumbnail_extracted = extractRapidApiThumbnail(parsed);
      diagnosis.author_extracted = extractRapidApiAuthor(parsed);
      // Don't include full response (too large) — just keys + extracted values
    } catch {
      diagnosis.api_response_raw = body.slice(0, 500);
    }
  } catch (err) {
    diagnosis.fetch_error = String(err);
  }

  res.json(diagnosis);
});

export default router;
