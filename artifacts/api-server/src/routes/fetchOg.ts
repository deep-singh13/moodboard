import { Router, type IRouter } from "express";

const router: IRouter = Router();

// Realistic Chrome 120 on Windows — prevents bot-detection blocks on most sites
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ── YouTube helpers ───────────────────────────────────────────────────────────
// YouTube blocks OG scraping from bots, so we use their public oEmbed API
// (no key required) and their always-available thumbnail CDN instead.

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

// ── Generic OG / thumbnail scraper ────────────────────────────────────────────

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
  try {
    return new URL(href, base).toString();
  } catch {
    return "";
  }
}

/** Loose check: absolute http(s) URL that contains an image-like extension */
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
  // ── meta tag helpers ──────────────────────────────────────────────────────
  const getMeta = (propOrName: string, attr: "property" | "name" = "property"): string | undefined => {
    const patterns = [
      new RegExp(`<meta[^>]+${attr}=["']${propOrName}["'][^>]+content=["']([^"']+)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${propOrName}["']`, "i"),
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]) return m[1];
    }
    return undefined;
  };

  const titleFallback = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  const rawTitle = getMeta("og:title") ?? getMeta("twitter:title", "name") ?? titleFallback;
  const rawDescription = getMeta("og:description") ?? getMeta("description", "name");

  // ── image extraction with fallback chain ──────────────────────────────────
  let image: string | undefined =
    getMeta("og:image") ??
    getMeta("og:image:url") ??
    getMeta("twitter:image", "name") ??
    getMeta("twitter:image:src", "name");

  // Fallback 1: <link rel="apple-touch-icon">
  if (!image) {
    const m =
      html.match(/<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i) ??
      html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon["']/i);
    if (m?.[1]) {
      const abs = toAbsoluteUrl(m[1], baseUrl);
      if (isLikelyImageUrl(abs)) image = abs;
    }
  }

  // Fallback 2: first <img> with width or height >= 200
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

// ── Route ─────────────────────────────────────────────────────────────────────

router.get("/fetch-og", async (req, res) => {
  const url = req.query.url as string | undefined;
  if (!url) {
    res.status(400).json({ error: "url query parameter is required" });
    return;
  }

  // YouTube: skip scraping, use oEmbed + CDN thumbnail
  const videoId = extractYouTubeId(url);
  if (videoId) {
    const meta = await fetchYouTubeMeta(url, videoId);
    res.json(meta);
    return;
  }

  // Everything else: scrape with a real browser UA
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
      // Return empty result + flag so the frontend can show the toast
      res.json({ fetchFailed: true });
      return;
    }

    const html = await response.text();
    const meta = parseOgTags(html, url);
    res.json(meta);
  } catch {
    // Timeout, network error, or private profile (e.g. Instagram 401/private)
    res.json({ fetchFailed: true });
  }
});

export default router;
