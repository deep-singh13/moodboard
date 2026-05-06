import { Router, type IRouter } from "express";

const router: IRouter = Router();

// Realistic Chrome 120 on Windows — used for most generic sites
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Meta's own link-preview crawler — Instagram / Facebook whitelist this UA
// so that Messenger / WhatsApp can generate rich link previews. Using it
// causes Instagram to return the real post/reel og:image instead of the
// generic app logo it sends to ordinary browser UAs.
const FACEBOOK_CRAWLER_UA =
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

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

// ── Instagram helpers ─────────────────────────────────────────────────────────

function isInstagramUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "www.instagram.com" || host === "instagram.com";
  } catch {
    return false;
  }
}

// The Instagram app logo is served from the main domain's /static/ path.
// Real post/reel thumbnails come from scontent CDN subdomains, which must NOT
// be blocked — they are the URLs we actually want to return.
function isInstagramLogoUrl(imageUrl: string): boolean {
  try {
    const host = new URL(imageUrl).hostname;
    // Main domain = favicon/icon/logo assets only; CDN subdomains = real media
    return host === "www.instagram.com" || host === "instagram.com";
  } catch {
    return false;
  }
}

/**
 * Primary approach: facebookexternalhit UA.
 * Instagram must whitelist this crawler so Messenger/WhatsApp can generate
 * link previews. It receives the real og:image, not the app logo.
 */
async function tryInstagramScrape(url: string): Promise<{
  title?: string;
  image?: string;
} | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": FACEBOOK_CRAWLER_UA,
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;

    const html = await response.text();

    // Extract og:image
    const ogImage =
      extractMetaContent(html, "property", "og:image") ??
      extractMetaContent(html, "property", "og:image:url") ??
      extractMetaContent(html, "name", "twitter:image");

    // Reject if we got the generic app logo instead of real content
    if (!ogImage || isInstagramLogoUrl(ogImage)) return null;

    const ogTitle =
      extractMetaContent(html, "property", "og:title") ??
      extractMetaContent(html, "name", "twitter:title");

    return { title: ogTitle, image: ogImage };
  } catch {
    return null;
  }
}

/**
 * Secondary approach: Instagram oEmbed via Graph API.
 * Requires INSTAGRAM_APP_ID + INSTAGRAM_APP_SECRET env vars (free Facebook
 * developer app). The App Access Token never expires and needs no user auth.
 * Setup: https://developers.facebook.com/apps → create app → copy App ID + Secret
 */
async function tryInstagramOEmbed(url: string): Promise<{
  title?: string;
  image?: string;
} | null> {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appId || !appSecret) return null;

  try {
    const token = `${appId}|${appSecret}`;
    const apiUrl =
      `https://graph.facebook.com/v18.0/instagram_oembed` +
      `?url=${encodeURIComponent(url)}` +
      `&access_token=${encodeURIComponent(token)}` +
      `&omitscript=true`;

    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      thumbnail_url?: string;
      author_name?: string;
      title?: string;
    };

    if (!data.thumbnail_url) return null;
    return {
      title: data.author_name ? `@${data.author_name}` : (data.title ?? undefined),
      image: data.thumbnail_url,
    };
  } catch {
    return null;
  }
}

async function fetchInstagramMeta(url: string): Promise<{
  title?: string;
  image?: string;
  fetchFailed?: boolean;
}> {
  // Try facebookexternalhit scrape first — no credentials needed
  const scraped = await tryInstagramScrape(url);
  if (scraped?.image) return scraped;

  // Fall back to the official oEmbed API if credentials are configured
  const oembed = await tryInstagramOEmbed(url);
  if (oembed?.image) return oembed;

  // Both methods failed (private account, changed UA detection, etc.)
  return { fetchFailed: true };
}

// ── Generic OG scraper helpers ────────────────────────────────────────────────

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

  // Fallback 1: apple-touch-icon
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

  // Instagram: use facebookexternalhit UA + oEmbed API fallback
  if (isInstagramUrl(url)) {
    const meta = await fetchInstagramMeta(url);
    res.json(meta);
    return;
  }

  // YouTube: oEmbed + CDN thumbnail (no scraping needed)
  const videoId = extractYouTubeId(url);
  if (videoId) {
    const meta = await fetchYouTubeMeta(url, videoId);
    res.json(meta);
    return;
  }

  // Everything else: scrape with realistic browser UA
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

export default router;
