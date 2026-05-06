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

// ── Instagram via oEmbed API ──────────────────────────────────────────────────
// The Graph API oEmbed endpoint returns a signed CDN URL for the thumbnail.
// We immediately download and base64-encode that image so it never expires in
// the user's database (Instagram CDN URLs have short TTLs of ~24-72 hours).

function isInstagramUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "www.instagram.com" || host === "instagram.com";
  } catch {
    return false;
  }
}

/** Download an image URL and return it as a base64 data URL for permanent storage. */
async function downloadAsDataUrl(imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.error(`[instagram] Failed to download thumbnail: HTTP ${res.status} ${imageUrl}`);
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    console.log(`[instagram] Downloaded thumbnail: ${buffer.byteLength} bytes, type=${contentType}`);
    return `data:${contentType};base64,${base64}`;
  } catch (err) {
    console.error(`[instagram] Thumbnail download error: ${err}`);
    return null;
  }
}

async function fetchInstagramMeta(url: string): Promise<{
  title?: string;
  image?: string;
  fetchFailed?: boolean;
}> {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;

  // Credentials check — log clearly so Render logs show the issue
  if (!appId || !appSecret) {
    console.error("[instagram] INSTAGRAM_APP_ID or INSTAGRAM_APP_SECRET not set — cannot fetch thumbnail");
    return { fetchFailed: true };
  }

  console.log(`[instagram] Fetching oEmbed for: ${url}`);
  console.log(`[instagram] Using App ID: ${appId.slice(0, 6)}...`);

  const token = `${appId}|${appSecret}`;
  const apiUrl =
    `https://graph.facebook.com/v18.0/instagram_oembed` +
    `?url=${encodeURIComponent(url)}` +
    `&access_token=${encodeURIComponent(token)}` +
    `&omitscript=true`;

  try {
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
    const body = await res.text();

    if (!res.ok) {
      console.error(`[instagram] oEmbed API error: HTTP ${res.status} — ${body}`);
      return { fetchFailed: true };
    }

    const data = JSON.parse(body) as {
      thumbnail_url?: string;
      author_name?: string;
      title?: string;
      error?: { message: string; type: string; code: number };
    };

    // The API can return HTTP 200 but with an error object inside
    if (data.error) {
      console.error(`[instagram] oEmbed API returned error: ${JSON.stringify(data.error)}`);
      return { fetchFailed: true };
    }

    console.log(`[instagram] oEmbed success — thumbnail_url: ${data.thumbnail_url ?? "none"}, author: ${data.author_name ?? "none"}`);

    if (!data.thumbnail_url) {
      console.warn("[instagram] oEmbed returned no thumbnail_url");
      return {
        title: data.author_name ? `@${data.author_name}` : undefined,
        fetchFailed: true,
      };
    }

    // Download the thumbnail immediately and store as base64.
    // Instagram CDN URLs expire — the data URL lasts forever.
    const dataUrl = await downloadAsDataUrl(data.thumbnail_url);
    return {
      title: data.author_name ? `@${data.author_name}` : (data.title ?? undefined),
      image: dataUrl ?? data.thumbnail_url, // fall back to raw URL if download failed
    };
  } catch (err) {
    console.error(`[instagram] oEmbed fetch threw: ${err}`);
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
 * Debug endpoint — hit this in a browser or curl to see exactly what the
 * oEmbed API returns for any Instagram URL without adding a card.
 *
 * Usage: GET /api/debug-instagram?url=https://www.instagram.com/reel/ABC123/
 */
router.get("/debug-instagram", async (req, res) => {
  const url = req.query.url as string | undefined;
  if (!url) {
    res.status(400).json({ error: "url query parameter is required" });
    return;
  }

  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;

  const diagnosis: Record<string, unknown> = {
    url,
    INSTAGRAM_APP_ID_set: !!appId,
    INSTAGRAM_APP_SECRET_set: !!appSecret,
    app_id_preview: appId ? `${appId.slice(0, 6)}...` : null,
  };

  if (!appId || !appSecret) {
    res.json({ ...diagnosis, error: "credentials_missing" });
    return;
  }

  const token = `${appId}|${appSecret}`;
  const apiUrl =
    `https://graph.facebook.com/v18.0/instagram_oembed` +
    `?url=${encodeURIComponent(url)}` +
    `&access_token=${encodeURIComponent(token)}` +
    `&omitscript=true`;

  diagnosis.api_url_called = apiUrl.replace(token, "APP_ID|APP_SECRET");

  try {
    const apiRes = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
    const body = await apiRes.text();
    diagnosis.http_status = apiRes.status;
    try {
      diagnosis.api_response = JSON.parse(body);
    } catch {
      diagnosis.api_response_raw = body;
    }
  } catch (err) {
    diagnosis.fetch_error = String(err);
  }

  res.json(diagnosis);
});

export default router;
