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
// Three attempts in order — first success wins:
//
// 1. Legacy public oEmbed (api.instagram.com/oembed) — deprecated but still
//    partially active for public posts, completely free, no setup needed.
//
// 2. Embed page scrape (/p/{shortcode}/embed/) — Instagram MUST serve this
//    from all IPs because it powers every iframe embed on the web.
//    We parse the JSON blob Instagram injects into that page.
//
// 3. RapidAPI (any Instagram scraper) — uses residential proxies, bypasses
//    IP blocks. Free tier on most scrapers. Requires two env vars:
//      RAPIDAPI_KEY          → your RapidAPI key
//      RAPIDAPI_INSTAGRAM_HOST → the scraper's host, e.g.
//                                instagram-scraper-api2.p.rapidapi.com
//    On rapidapi.com search "instagram" → filter Free → subscribe to any
//    scraper that has a "get post" or "post info" endpoint → copy its host.

function isInstagramUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "www.instagram.com" || host === "instagram.com";
  } catch {
    return false;
  }
}

/** Download an image URL and return it as a base64 data URL for permanent storage.
 *  Instagram CDN URLs expire after ~24-72 hours — base64 lasts forever in the DB. */
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

// ── Attempt 1: Legacy Instagram public oEmbed ─────────────────────────────────

async function tryLegacyOEmbed(url: string): Promise<{ title?: string; image?: string } | null> {
  try {
    const oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}&format=json&omitscript=true`;
    console.log(`[instagram:1] trying legacy oEmbed`);
    const res = await fetch(oembedUrl, {
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(8000),
    });
    const rawBody = await res.text();
    const contentType = res.headers.get("content-type") ?? "";
    // If Instagram returns HTML (login redirect), the endpoint is blocked for this IP
    if (contentType.includes("html") || rawBody.trimStart().startsWith("<")) {
      console.log(`[instagram:1] legacy oEmbed returned HTML — blocked for datacenter IPs`);
      return null;
    }
    if (!res.ok) {
      console.log(`[instagram:1] legacy oEmbed HTTP ${res.status} — skipping`);
      return null;
    }
    let data: { thumbnail_url?: string; author_name?: string };
    try {
      data = JSON.parse(rawBody) as { thumbnail_url?: string; author_name?: string };
    } catch {
      console.log(`[instagram:1] legacy oEmbed JSON parse failed`);
      return null;
    }
    if (!data.thumbnail_url) {
      console.log(`[instagram:1] legacy oEmbed: no thumbnail_url in response`);
      return null;
    }
    console.log(`[instagram:1] legacy oEmbed success: ${data.thumbnail_url.slice(0, 80)}...`);
    return {
      title: data.author_name ? `@${data.author_name}` : undefined,
      image: data.thumbnail_url,
    };
  } catch (err) {
    console.log(`[instagram:1] legacy oEmbed threw: ${err}`);
    return null;
  }
}

// ── Attempt 2: Embed page scrape (multiple URL patterns + iframe headers) ─────
//
// Instagram serves a lightweight embed page to iframe requests. The key is
// sending Sec-Fetch-Dest: iframe + Referer so their servers treat it as a
// legitimate embed rather than a datacenter bot hitting the main app.
// We try four URL patterns (p vs reel, with/without /captioned/) and extract
// the image from the JSON blob, scontent CDN regex, or og:image meta tag.

const EMBED_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function tryEmbedPageScrape(shortcode: string): Promise<{ title?: string; image?: string } | null> {
  // Four embed URL patterns Instagram might respond to
  const candidates = [
    `https://www.instagram.com/p/${shortcode}/embed/captioned/`,
    `https://www.instagram.com/reel/${shortcode}/embed/captioned/`,
    `https://www.instagram.com/p/${shortcode}/embed/`,
    `https://www.instagram.com/reel/${shortcode}/embed/`,
  ];

  for (const embedUrl of candidates) {
    try {
      console.log(`[instagram:2] trying embed page: ${embedUrl}`);
      const res = await fetch(embedUrl, {
        headers: {
          "User-Agent": EMBED_UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          // Tell Instagram this is an iframe embed request — critical
          "Sec-Fetch-Dest": "iframe",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "cross-site",
          Referer: "https://www.google.com/",
          "Cache-Control": "no-cache",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) {
        console.log(`[instagram:2] ${embedUrl} → HTTP ${res.status} — trying next`);
        continue;
      }
      const html = await res.text();

      let imageUrl: string | undefined;
      let username: string | undefined;

      // 1. JSON blob: window.__additionalDataLoaded or window.__sharedData
      const jsonBlobMatch =
        html.match(/window\.__additionalDataLoaded\([^,]+,(\{.+?\})\);/s) ??
        html.match(/window\.__sharedData\s*=\s*(\{.+?\});/s);

      if (jsonBlobMatch?.[1]) {
        try {
          const displayUrl = jsonBlobMatch[1].match(/"display_url"\s*:\s*"([^"]+)"/)?.[1];
          const thumbSrc   = jsonBlobMatch[1].match(/"thumbnail_src"\s*:\s*"([^"]+)"/)?.[1];
          const raw = displayUrl ?? thumbSrc;
          if (raw) {
            imageUrl = raw
              .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
              .replace(/\\\//g, "/");
          }
          username = jsonBlobMatch[1].match(/"username"\s*:\s*"([^"]+)"/)?.[1];
        } catch { /* fall through */ }
      }

      // 2. Any scontent CDN URL in source
      if (!imageUrl) {
        const m = html.match(/(https:\\?\/\\?\/scontent[^"' <>]+\.(?:jpg|jpeg|png|webp))/i);
        if (m?.[1]) imageUrl = m[1].replace(/\\\//g, "/").replace(/\\u0026/g, "&");
      }

      // 3. og:image / twitter:image meta tags (server-rendered on some edge nodes)
      if (!imageUrl) {
        const og = parseOgTags(html, embedUrl);
        if (og.image && og.image.includes("cdninstagram.com")) {
          imageUrl = og.image;
          console.log(`[instagram:2] found image via og:image meta`);
        }
      }

      if (!imageUrl) {
        console.log(`[instagram:2] ${embedUrl} — no image found (html length: ${html.length})`);
        continue;
      }

      if (!username) {
        username = html.match(/"username"\s*:\s*"([^"]+)"/)?.[1];
      }

      console.log(`[instagram:2] success via ${embedUrl}: ${imageUrl.slice(0, 80)}...`);
      return { title: username ? `@${username}` : undefined, image: imageUrl };
    } catch (err) {
      console.log(`[instagram:2] ${embedUrl} threw: ${err}`);
    }
  }

  console.log(`[instagram:2] all embed URL patterns failed`);
  return null;
}

// ── Attempt 3: RapidAPI (any Instagram scraper the user configures) ───────────

/** Extract thumbnail from any common RapidAPI Instagram scraper response format. */
function extractRapidApiThumbnail(data: Record<string, unknown>): string | null {
  const root = (data.data ?? data) as Record<string, unknown>;
  const itemsArr = Array.isArray(root.items) ? root.items : null;
  const item = (itemsArr?.[0] ?? root.item ?? root) as Record<string, unknown>;

  // image_versions2.candidates (Instagram Graph format used by most scrapers)
  const candidates = ((item.image_versions2 as Record<string, unknown> | undefined)
    ?.candidates) as Array<{ url?: string }> | undefined;
  if (candidates?.[0]?.url) return candidates[0].url as string;

  // Carousel: first node
  const carousel = item.carousel_media as Array<Record<string, unknown>> | undefined;
  if (carousel?.length) {
    const c2 = ((carousel[0].image_versions2 as Record<string, unknown> | undefined)
      ?.candidates) as Array<{ url?: string }> | undefined;
    if (c2?.[0]?.url) return c2[0].url as string;
  }

  // Direct thumbnail_url field (some scrapers)
  if (typeof item.thumbnail_url === "string") return item.thumbnail_url;
  if (typeof root.thumbnail_url === "string") return root.thumbnail_url as string;

  return null;
}

function extractRapidApiAuthor(data: Record<string, unknown>): string | null {
  const root = (data.data ?? data) as Record<string, unknown>;
  const itemsArr = Array.isArray(root.items) ? root.items : null;
  const item = (itemsArr?.[0] ?? root.item ?? root) as Record<string, unknown>;
  return ((item.user as Record<string, unknown> | undefined)?.username as string) ?? null;
}

async function tryRapidApi(shortcodeOrUrl: string): Promise<{ title?: string; image?: string } | null> {
  const key  = process.env.RAPIDAPI_KEY;
  const host = process.env.RAPIDAPI_INSTAGRAM_HOST;
  if (!key || !host) {
    console.log(`[instagram:3] RAPIDAPI_KEY or RAPIDAPI_INSTAGRAM_HOST not set — skipping`);
    return null;
  }

  // Try the two most common endpoint patterns used across RapidAPI Instagram scrapers
  const endpoints = [
    `https://${host}/v1/post_info?code_or_id_or_url=${encodeURIComponent(shortcodeOrUrl)}`,
    `https://${host}/v1.2/post_info?code_or_id_or_url=${encodeURIComponent(shortcodeOrUrl)}`,
    `https://${host}/media?url=${encodeURIComponent(shortcodeOrUrl)}`,
    `https://${host}/post?shortcode=${encodeURIComponent(shortcodeOrUrl)}`,
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`[instagram:3] trying RapidAPI endpoint: ${endpoint}`);
      const res = await fetch(endpoint, {
        headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": host },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) { console.log(`[instagram:3] HTTP ${res.status} — trying next`); continue; }

      const body = await res.text();
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(body) as Record<string, unknown>; }
      catch { console.log(`[instagram:3] non-JSON response — trying next`); continue; }

      const thumbnail = extractRapidApiThumbnail(parsed);
      const author = extractRapidApiAuthor(parsed);
      if (!thumbnail) { console.log(`[instagram:3] no thumbnail in response — trying next`); continue; }

      console.log(`[instagram:3] RapidAPI success via ${endpoint}: ${thumbnail.slice(0, 80)}...`);
      return { title: author ? `@${author}` : undefined, image: thumbnail };
    } catch (err) {
      console.log(`[instagram:3] endpoint threw: ${err} — trying next`);
    }
  }
  return null;
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

async function fetchInstagramMeta(url: string): Promise<{
  title?: string;
  image?: string;
  fetchFailed?: boolean;
}> {
  const shortcodeMatch = url.match(/instagram\.com\/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
  const shortcode = shortcodeMatch?.[1];

  console.log(`[instagram] starting 3-attempt fetch for: ${url}`);

  // Attempt 1 — legacy public oEmbed (free, no setup)
  const attempt1 = await tryLegacyOEmbed(url);
  if (attempt1?.image) {
    const dataUrl = await downloadAsDataUrl(attempt1.image);
    return { ...attempt1, image: dataUrl ?? attempt1.image };
  }

  // Attempt 2 — embed page scrape (works even from datacenter IPs)
  if (shortcode) {
    const attempt2 = await tryEmbedPageScrape(shortcode);
    if (attempt2?.image) {
      const dataUrl = await downloadAsDataUrl(attempt2.image);
      return { ...attempt2, image: dataUrl ?? attempt2.image };
    }
  }

  // Attempt 3 — RapidAPI (any scraper, configurable via env vars)
  const attempt3 = await tryRapidApi(shortcode ?? url);
  if (attempt3?.image) {
    const dataUrl = await downloadAsDataUrl(attempt3.image);
    return { ...attempt3, image: dataUrl ?? attempt3.image };
  }

  console.error(`[instagram] all 3 attempts failed for: ${url}`);
  return { fetchFailed: true };
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
 * Debug endpoint — tests all three Instagram thumbnail-fetch attempts in
 * isolation and reports exactly what each one found (or why it failed).
 *
 * Usage: GET /api/debug-instagram?url=https://www.instagram.com/reel/ABC123/
 *
 * Returns JSON with keys:
 *   url, shortcode,
 *   attempt1_oembed   → { ok, thumbnail_url?, status?, error? }
 *   attempt2_embed    → { ok, image_url?, note?, error? }
 *   attempt3_rapidapi → { ok, thumbnail_url?, endpoint?, error?, skipped? }
 *   env               → { RAPIDAPI_KEY_set, RAPIDAPI_INSTAGRAM_HOST_set, host_preview? }
 */
router.get("/debug-instagram", async (req, res) => {
  const url = req.query.url as string | undefined;
  if (!url) {
    res.status(400).json({ error: "url query parameter is required" });
    return;
  }

  const shortcodeMatch = url.match(/instagram\.com\/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
  const shortcode = shortcodeMatch?.[1] ?? null;
  const rapidApiKey  = process.env.RAPIDAPI_KEY;
  const rapidApiHost = process.env.RAPIDAPI_INSTAGRAM_HOST;

  const report: Record<string, unknown> = {
    url,
    shortcode,
    env: {
      RAPIDAPI_KEY_set: !!rapidApiKey,
      RAPIDAPI_INSTAGRAM_HOST_set: !!rapidApiHost,
      host_preview: rapidApiHost ?? null,
    },
  };

  // ── Attempt 1: legacy oEmbed ─────────────────────────────────────────────────
  try {
    const oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}&format=json&omitscript=true`;
    const r = await fetch(oembedUrl, {
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(8000),
    });
    const rawBody = await r.text();
    const contentType = r.headers.get("content-type") ?? "";
    if (contentType.includes("html") || rawBody.trimStart().startsWith("<")) {
      // Instagram redirected to login/HTML page — endpoint is blocked for this IP
      report.attempt1_oembed = { ok: false, status: r.status, blocked: true, note: "Returned HTML instead of JSON — oEmbed blocked for datacenter IPs", body_snippet: rawBody.slice(0, 200) };
    } else if (r.ok) {
      try {
        const data = JSON.parse(rawBody) as Record<string, unknown>;
        report.attempt1_oembed = { ok: !!data.thumbnail_url, status: r.status, thumbnail_url: data.thumbnail_url ?? null, author_name: data.author_name ?? null, response_keys: Object.keys(data) };
      } catch {
        report.attempt1_oembed = { ok: false, status: r.status, parse_error: "JSON parse failed", body_snippet: rawBody.slice(0, 200) };
      }
    } else {
      report.attempt1_oembed = { ok: false, status: r.status, body_snippet: rawBody.slice(0, 300) };
    }
  } catch (err) {
    report.attempt1_oembed = { ok: false, error: String(err) };
  }

  // ── Attempt 2: embed page scrape (4 URL patterns, iframe headers) ───────────
  if (shortcode) {
    const embedCandidates = [
      `https://www.instagram.com/p/${shortcode}/embed/captioned/`,
      `https://www.instagram.com/reel/${shortcode}/embed/captioned/`,
      `https://www.instagram.com/p/${shortcode}/embed/`,
      `https://www.instagram.com/reel/${shortcode}/embed/`,
    ];
    const embedResults: unknown[] = [];
    let embedSuccess = false;

    for (const embedUrl of embedCandidates) {
      try {
        const r = await fetch(embedUrl, {
          headers: {
            "User-Agent": EMBED_UA,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Sec-Fetch-Dest": "iframe",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "cross-site",
            Referer: "https://www.google.com/",
            "Cache-Control": "no-cache",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(12000),
        });
        if (!r.ok) {
          embedResults.push({ url: embedUrl, status: r.status });
          continue;
        }
        const html = await r.text();
        let imageUrl: string | null = null;
        let method: string | null = null;

        const jsonBlobMatch =
          html.match(/window\.__additionalDataLoaded\([^,]+,(\{.+?\})\);/s) ??
          html.match(/window\.__sharedData\s*=\s*(\{.+?\});/s);
        if (jsonBlobMatch?.[1]) {
          try {
            const displayUrl = jsonBlobMatch[1].match(/"display_url"\s*:\s*"([^"]+)"/)?.[1];
            const thumbSrc   = jsonBlobMatch[1].match(/"thumbnail_src"\s*:\s*"([^"]+)"/)?.[1];
            const raw = displayUrl ?? thumbSrc;
            if (raw) { imageUrl = raw.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\\//g, "/"); method = "json_blob"; }
          } catch { /* ignore */ }
        }
        if (!imageUrl) {
          const m = html.match(/(https:\\?\/\\?\/scontent[^"' <>]+\.(?:jpg|jpeg|png|webp))/i);
          if (m?.[1]) { imageUrl = m[1].replace(/\\\//g, "/").replace(/\\u0026/g, "&"); method = "scontent_regex"; }
        }
        if (!imageUrl) {
          const og = parseOgTags(html, embedUrl);
          if (og.image && og.image.includes("cdninstagram.com")) { imageUrl = og.image; method = "og_image_meta"; }
        }

        embedResults.push({ url: embedUrl, status: r.status, html_length: html.length, json_blob_found: !!jsonBlobMatch?.[1], image_url: imageUrl, image_method: method, html_snippet: html.slice(0, 500) });
        if (imageUrl) { embedSuccess = true; break; }
      } catch (err) {
        embedResults.push({ url: embedUrl, error: String(err) });
      }
    }
    report.attempt2_embed = { ok: embedSuccess, candidates_tried: embedResults };
  } else {
    report.attempt2_embed = { ok: false, skipped: "no shortcode found in URL" };
  }

  // ── Attempt 3: RapidAPI ───────────────────────────────────────────────────────
  if (!rapidApiKey || !rapidApiHost) {
    report.attempt3_rapidapi = {
      ok: false,
      skipped: true,
      reason: !rapidApiKey && !rapidApiHost
        ? "RAPIDAPI_KEY and RAPIDAPI_INSTAGRAM_HOST not set"
        : !rapidApiKey
          ? "RAPIDAPI_KEY not set"
          : "RAPIDAPI_INSTAGRAM_HOST not set",
    };
  } else {
    const target = shortcode ?? url;
    const endpoints = [
      `https://${rapidApiHost}/v1/post_info?code_or_id_or_url=${encodeURIComponent(target)}`,
      `https://${rapidApiHost}/v1.2/post_info?code_or_id_or_url=${encodeURIComponent(target)}`,
      `https://${rapidApiHost}/media?url=${encodeURIComponent(url)}`,
      `https://${rapidApiHost}/post?shortcode=${encodeURIComponent(target)}`,
    ];
    const endpointResults: unknown[] = [];
    let rapidSuccess = false;

    for (const endpoint of endpoints) {
      try {
        const r = await fetch(endpoint, {
          headers: { "X-RapidAPI-Key": rapidApiKey, "X-RapidAPI-Host": rapidApiHost },
          signal: AbortSignal.timeout(12000),
        });
        const body = await r.text();
        if (!r.ok) {
          endpointResults.push({ endpoint, status: r.status, body_snippet: body.slice(0, 200) });
          continue;
        }
        let parsed: Record<string, unknown>;
        try { parsed = JSON.parse(body) as Record<string, unknown>; }
        catch { endpointResults.push({ endpoint, status: r.status, error: "non-JSON response", body_snippet: body.slice(0, 200) }); continue; }

        const thumbnail = extractRapidApiThumbnail(parsed);
        const author = extractRapidApiAuthor(parsed);
        endpointResults.push({ endpoint, status: r.status, thumbnail_extracted: thumbnail, author_extracted: author, response_keys: Object.keys(parsed) });
        if (thumbnail) { rapidSuccess = true; break; }
      } catch (err) {
        endpointResults.push({ endpoint, error: String(err) });
      }
    }
    report.attempt3_rapidapi = { ok: rapidSuccess, endpoints_tried: endpointResults };
  }

  res.json(report);
});

export default router;
