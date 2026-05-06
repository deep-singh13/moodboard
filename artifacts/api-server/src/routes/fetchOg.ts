import { Router, type IRouter } from "express";
import sharp from "sharp";

const router: IRouter = Router();

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ─────────────────────────────────────────────────────────────────────────────
// Image compression — convert any remote image URL into a permanent base64
// WebP data URL. Sharp resizes to max 800px and encodes WebP at q=82 — good
// quality, ~6-10× smaller than the source. Result is stored permanently in the
// DB's image_data column, so CDN TTLs (Instagram, Microlink, etc.) never bite.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_DIMENSION = 800;
const WEBP_QUALITY = 82;

async function compressToWebPDataUrl(imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn(`[compress] download failed for ${imageUrl}: HTTP ${res.status}`);
      return null;
    }
    const inputBuffer = Buffer.from(await res.arrayBuffer());
    const outputBuffer = await sharp(inputBuffer)
      .rotate() // auto-orient via EXIF
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toBuffer();
    const base64 = outputBuffer.toString("base64");
    console.log(
      `[compress] ${inputBuffer.byteLength}B → ${outputBuffer.byteLength}B WebP`,
    );
    return `data:image/webp;base64,${base64}`;
  } catch (err) {
    console.error(`[compress] error processing ${imageUrl}:`, err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// YouTube — oEmbed (free, deterministic, never fails on public videos).
// We don't compress YouTube thumbnails because their CDN URLs are stable and
// the i.ytimg.com images are already small JPEGs.
// ─────────────────────────────────────────────────────────────────────────────

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

async function fetchYouTubeMeta(_url: string, videoId: string): Promise<{
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
      const compressed = await compressToWebPDataUrl(thumbnail);
      return {
        title: data.title,
        description: data.author_name ? `by ${data.author_name}` : undefined,
        image: compressed ?? thumbnail,
      };
    }
  } catch {}
  const compressed = await compressToWebPDataUrl(thumbnail);
  return { image: compressed ?? thumbnail };
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic OG scraper — extract og:image / twitter:image from any HTML page.
// Used for normal websites (saves Microlink quota for the hard cases).
// ─────────────────────────────────────────────────────────────────────────────

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
    image: image ? toAbsoluteUrl(image, baseUrl) || image : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Microlink — the hybrid path for Instagram, TikTok, and any URL where
// direct OG scraping returns nothing useful.
//
// Two modes:
//   1. metadata: cheap & fast. Returns `data.image.url`. Works for most sites.
//   2. screenshot: renders the page in a real headless browser and returns a
//      screenshot URL. Used as fallback when metadata mode returns nothing or
//      returns an Instagram static asset (the IG logo).
//
// Free tier: 50 req/day, no API key. Set MICROLINK_API_KEY to use Pro tier.
// ─────────────────────────────────────────────────────────────────────────────

const MICROLINK_BASE = "https://api.microlink.io";

interface MicrolinkResponse {
  status?: string;
  statusCode?: number;
  message?: string;
  data?: {
    title?: string;
    description?: string;
    image?: { url?: string } | null;
    screenshot?: { url?: string } | null;
    author?: string;
  };
}

function microlinkHeaders(): Record<string, string> {
  const key = process.env.MICROLINK_API_KEY;
  return key ? { "x-api-key": key } : {};
}

/** Microlink sometimes returns Instagram's static UI assets (the logo) as
 *  og:image. We detect those and fall through to screenshot mode. */
function isInstagramStaticAsset(imageUrl: string): boolean {
  return /static\.cdninstagram\.com\/rsrc\.php\//i.test(imageUrl);
}

function isInstagramUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "www.instagram.com" || host === "instagram.com";
  } catch {
    return false;
  }
}

async function callMicrolinkMetadata(targetUrl: string): Promise<{
  title?: string;
  description?: string;
  image?: string;
} | null> {
  try {
    const apiUrl = `${MICROLINK_BASE}?url=${encodeURIComponent(targetUrl)}`;
    console.log(`[microlink:meta] ${apiUrl}`);
    const res = await fetch(apiUrl, {
      headers: microlinkHeaders(),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      console.warn(`[microlink:meta] HTTP ${res.status}`);
      return null;
    }
    const body = (await res.json()) as MicrolinkResponse;
    if (body.status !== "success" || !body.data) {
      console.warn(`[microlink:meta] non-success response: ${body.status} ${body.message ?? ""}`);
      return null;
    }
    const image = body.data.image?.url;
    return {
      title: body.data.title,
      description: body.data.description,
      image: image ?? undefined,
    };
  } catch (err) {
    console.error(`[microlink:meta] error:`, err);
    return null;
  }
}

async function callMicrolinkScreenshot(targetUrl: string): Promise<{
  title?: string;
  description?: string;
  image?: string;
} | null> {
  try {
    // viewport=1200x630 is the standard OG image aspect ratio (~1.91:1)
    const apiUrl =
      `${MICROLINK_BASE}?url=${encodeURIComponent(targetUrl)}` +
      `&screenshot=true&meta=false&viewport.width=1200&viewport.height=630`;
    console.log(`[microlink:screenshot] ${apiUrl}`);
    const res = await fetch(apiUrl, {
      headers: microlinkHeaders(),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      console.warn(`[microlink:screenshot] HTTP ${res.status}`);
      return null;
    }
    const body = (await res.json()) as MicrolinkResponse;
    if (body.status !== "success" || !body.data) {
      console.warn(`[microlink:screenshot] non-success: ${body.status} ${body.message ?? ""}`);
      return null;
    }
    const image = body.data.screenshot?.url;
    if (!image) {
      console.warn(`[microlink:screenshot] no screenshot URL in response`);
      return null;
    }
    return {
      title: body.data.title,
      description: body.data.description,
      image,
    };
  } catch (err) {
    console.error(`[microlink:screenshot] error:`, err);
    return null;
  }
}

/** Hybrid orchestrator: metadata first, screenshot fallback. */
async function fetchViaMicrolink(targetUrl: string): Promise<{
  title?: string;
  description?: string;
  image?: string;
  fetchFailed?: boolean;
}> {
  // 1. Metadata mode
  const meta = await callMicrolinkMetadata(targetUrl);
  if (meta?.image && !isInstagramStaticAsset(meta.image)) {
    const compressed = await compressToWebPDataUrl(meta.image);
    if (compressed) {
      return { title: meta.title, description: meta.description, image: compressed };
    }
    console.warn(`[microlink] metadata image found but compression failed — trying screenshot`);
  } else if (meta?.image) {
    console.log(`[microlink] metadata returned IG static asset — trying screenshot`);
  } else {
    console.log(`[microlink] metadata returned no image — trying screenshot`);
  }

  // 2. Screenshot fallback
  const shot = await callMicrolinkScreenshot(targetUrl);
  if (shot?.image) {
    const compressed = await compressToWebPDataUrl(shot.image);
    if (compressed) {
      return {
        title: shot.title ?? meta?.title,
        description: shot.description ?? meta?.description,
        image: compressed,
      };
    }
  }

  console.error(`[microlink] both modes failed for ${targetUrl}`);
  return {
    title: meta?.title ?? shot?.title,
    description: meta?.description ?? shot?.description,
    fetchFailed: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

router.get("/fetch-og", async (req, res) => {
  const url = req.query.url as string | undefined;
  if (!url) {
    res.status(400).json({ error: "url query parameter is required" });
    return;
  }

  // YouTube → oEmbed (free, deterministic)
  const videoId = extractYouTubeId(url);
  if (videoId) {
    const meta = await fetchYouTubeMeta(url, videoId);
    res.json(meta);
    return;
  }

  // Instagram → straight to Microlink (direct fetch is hopeless from datacenter IPs)
  if (isInstagramUrl(url)) {
    const meta = await fetchViaMicrolink(url);
    res.json(meta);
    return;
  }

  // Generic websites → try direct OG scrape first (free, no quota)
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      const html = await response.text();
      const og = parseOgTags(html, url);
      if (og.image) {
        const compressed = await compressToWebPDataUrl(og.image);
        res.json({
          title: og.title,
          description: og.description,
          image: compressed ?? og.image,
        });
        return;
      }
      // Got HTML but no image — fall through to Microlink
      console.log(`[fetch-og] no og:image in direct fetch — falling back to Microlink`);
    } else {
      console.log(`[fetch-og] direct fetch HTTP ${response.status} — falling back to Microlink`);
    }
  } catch (err) {
    console.log(`[fetch-og] direct fetch threw — falling back to Microlink:`, err);
  }

  // Last resort: Microlink hybrid
  const meta = await fetchViaMicrolink(url);
  res.json(meta);
});

export default router;
