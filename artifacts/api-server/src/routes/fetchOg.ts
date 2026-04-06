import { Router, type IRouter } from "express";

const router: IRouter = Router();

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

router.get("/fetch-og", async (req, res) => {
  const url = req.query.url as string | undefined;
  if (!url) {
    res.status(400).json({ error: "url query parameter is required" });
    return;
  }

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
