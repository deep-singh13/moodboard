import { Router, type IRouter } from "express";

const router: IRouter = Router();

// ── YouTube helpers ───────────────────────────────────────────────────────────
// YouTube blocks OG scraping from bots, so we use their public oEmbed API
// (no key required) and their always-available thumbnail CDN instead.

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname;
    // youtu.be/VIDEO_ID
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    // youtube.com/watch?v=VIDEO_ID
    const v = u.searchParams.get("v");
    if (v) return v;
    // youtube.com/shorts/VIDEO_ID  or  youtube.com/embed/VIDEO_ID
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
  // hqdefault is always available; maxresdefault 404s on some older videos
  const thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  try {
    const oembedUrl =
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`,
      )}&format=json`;
    const res = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        title?: string;
        author_name?: string;
      };
      return {
        title: data.title,
        description: data.author_name ? `by ${data.author_name}` : undefined,
        image: thumbnail,
      };
    }
  } catch {}

  // oEmbed failed — at least return the thumbnail so the card isn't blank
  return { image: thumbnail };
}

// ── Generic OG scraper ────────────────────────────────────────────────────────

function parseOgTags(html: string): {
  title?: string;
  description?: string;
  image?: string;
} {
  const getOg = (prop: string): string | undefined => {
    const patterns = [
      new RegExp(
        `<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`,
        "i",
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`,
        "i",
      ),
      new RegExp(
        `<meta[^>]+name=["']og:${prop}["'][^>]+content=["']([^"']+)["']`,
        "i",
      ),
      ...(prop === "image"
        ? [
            new RegExp(
              `<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']`,
              "i",
            ),
            new RegExp(
              `<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']`,
              "i",
            ),
          ]
        : []),
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m) return m[1];
    }
    return undefined;
  };

  const titleFallback = html
    .match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
    ?.trim();
  return {
    title: getOg("title") ?? titleFallback,
    description: getOg("description"),
    image: getOg("image"),
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

  // Everything else: scrape OG tags
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Moodboard/1.0; +https://moodboard.replit.app)",
        Accept: "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      res
        .status(response.status)
        .json({ error: `Upstream responded with ${response.status}` });
      return;
    }

    const html = await response.text();
    const meta = parseOgTags(html);
    res.json(meta);
  } catch {
    res.status(500).json({ error: "Failed to fetch URL" });
  }
});

export default router;
