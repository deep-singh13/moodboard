import { Router, type IRouter } from "express";
import express from "express";
import { pool } from "../lib/db";

const router: IRouter = Router();

// ── OG helpers (mirrors fetchOg.ts) ──────────────────────────────────────────

function parseOgTags(html: string): {
  title?: string;
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
    image: getOg("image"),
  };
}

async function fetchOgMeta(
  url: string,
): Promise<{ title?: string; image?: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Moodboard/1.0; +https://moodboard-zyji.onrender.com)",
        Accept: "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return {};
    const html = await res.text();
    return parseOgTags(html);
  } catch {
    return {};
  }
}

// ── Claude Vision helper ──────────────────────────────────────────────────────

async function extractSubstacksFromImage(
  base64Data: string,
  mimeType: string,
): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType,
                data: base64Data,
              },
            },
            {
              type: "text",
              text: `You are processing a screenshot from an Instagram carousel post that recommends Substack newsletters.

Extract every Substack newsletter handle, name, or URL visible in this image.

Rules:
- If you see "username.substack.com" → include as "https://username.substack.com"
- If you see "@username" or just "username" next to a Substack mention → "https://username.substack.com"
- If you see a newsletter display name (e.g. "The Pragmatic Engineer") → guess the handle: "https://pragmaticengineer.substack.com"
- If you see a custom domain clearly tied to a newsletter (e.g. "platformer.news") → include as "https://platformer.news"
- No duplicates
- Return [] if no Substack content is found

Return ONLY a valid JSON array of URLs — no explanation, no markdown, nothing else.
Example: ["https://lenny.substack.com","https://pragmaticengineer.substack.com"]`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Claude API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };

  const text = data.content?.[0]?.text?.trim() ?? "[]";

  // Extract JSON array from Claude's response (handles edge cases)
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  const urls = JSON.parse(match[0]) as unknown[];
  return urls.filter((u): u is string => typeof u === "string" && u.startsWith("http"));
}

// ── Route ─────────────────────────────────────────────────────────────────────
// Accepts JSON body: { imageBase64: string, mimeType?: string }
// imageBase64 can optionally include the data URI prefix — we strip it.

router.post(
  "/import-screenshot",
  express.json({ limit: "20mb" }),
  async (req, res) => {
    const body = req.body as {
      imageBase64?: string;
      mimeType?: string;
    };

    if (!body.imageBase64) {
      res.status(400).json({ error: "imageBase64 is required" });
      return;
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured on the server" });
      return;
    }

    // Strip data URI prefix if the Shortcut includes it
    const base64Data = body.imageBase64.replace(/^data:[^;]+;base64,/, "");
    const mimeType = (body.mimeType ?? "image/jpeg") as string;

    // 1. Ask Claude Vision to extract Substack URLs
    let substackUrls: string[];
    try {
      substackUrls = await extractSubstacksFromImage(base64Data, mimeType);
    } catch (err) {
      console.error("Claude Vision error:", err);
      res.status(502).json({ error: "Failed to process image with AI" });
      return;
    }

    if (substackUrls.length === 0) {
      res.json({ added: [], count: 0, message: "No Substack links found in this image" });
      return;
    }

    // 2. For each URL: fetch OG metadata + save to DB
    const added: Array<{ id: string; url: string; title: string }> = [];

    for (const url of substackUrls) {
      try {
        const og = await fetchOgMeta(url);
        const hostname = new URL(url).hostname;
        const id = crypto.randomUUID();
        const type = url.includes("substack.com") ? "substack" : "link";
        const title = og.title ?? hostname;
        const subtitle = hostname;
        const imageUrl = og.image ?? null;
        const addedAt = new Date().toISOString();

        await pool.query(
          `INSERT INTO items
             (id, type, url, title, subtitle, image_url, size, position_x, position_y, added_at, image_data)
           VALUES ($1, $2, $3, $4, $5, $6, '320', 0, 0, $7, NULL)
           ON CONFLICT (id) DO NOTHING`,
          [id, type, url, title, subtitle, imageUrl, addedAt],
        );

        added.push({ id, url, title });
      } catch (err) {
        console.error("Failed to save item for URL:", url, err);
      }
    }

    res.json({
      added,
      count: added.length,
      message: `Added ${added.length} Substack${added.length === 1 ? "" : "s"} to your moodboard`,
    });
  },
);

export default router;
