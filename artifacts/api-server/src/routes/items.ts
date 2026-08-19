import { Router, type IRouter } from "express";
import { pool } from "../lib/db";
import { fetchPriceInfo } from "../lib/fetchPrice";

const router: IRouter = Router();

function rowToItem(row: Record<string, unknown>) {
  return {
    id: row.id,
    type: row.type,
    url: row.url ?? undefined,
    title: row.title ?? undefined,
    subtitle: row.subtitle ?? undefined,
    imageUrl:
      (row.image_url as string | null) ??
      (row.image_data as string | null) ??
      undefined,
    size: row.size ? Number(row.size) : undefined,
    addedAt: row.added_at,
    completed: row.completed ?? false,
    pinned: row.pinned ?? false,
    note: (row.note as string | null) ?? undefined,
    board: (row.board as string | null) ?? "moodboard",
    meta: (row.meta as string | null) ?? undefined,
    price: row.price !== null && row.price !== undefined ? Number(row.price) : undefined,
    currency: (row.currency as string | null) ?? undefined,
    availability: (row.availability as string | null) ?? undefined,
    priceUpdatedAt: (row.price_updated_at as string | null) ?? undefined,
  };
}

/** Runs async tasks with a concurrency cap so a large bulk refresh doesn't
 *  fire dozens of simultaneous outbound requests at once. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function refreshItemPriceRow(id: string, url: string) {
  const info = await fetchPriceInfo(url);
  const result = await pool.query(
    `UPDATE items
       SET price = $1, currency = $2, availability = $3, price_updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
    [info.price ?? null, info.currency ?? null, info.availability ?? "unknown", id],
  );
  return result.rows[0] ? rowToItem(result.rows[0]) : null;
}

router.get("/items", async (req, res) => {
  const board = (req.query.board as string | undefined) ?? "moodboard";
  try {
    const result = await pool.query(
      "SELECT * FROM items WHERE board = $1 ORDER BY pinned DESC, added_at DESC",
      [board],
    );
    res.json(result.rows.map(rowToItem));
  } catch {
    res.status(500).json({ error: "Failed to fetch items" });
  }
});

/** `meta` is stored as an opaque JSON string, so nothing downstream can tell a
 *  malformed payload from an absent one — every client reader just falls back
 *  to {}. Rejecting non-JSON here keeps the column honest. */
function isStorableMeta(meta: unknown): boolean {
  if (meta === null || meta === undefined) return true;
  if (typeof meta !== "string") return false;
  try {
    const parsed: unknown = JSON.parse(meta);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

router.post("/items", async (req, res) => {
  const body = req.body as Record<string, string | null | undefined>;
  const { id, type, url, title, subtitle, imageUrl, size, addedAt, board, meta } =
    body;
  const note = (body.note as string | null | undefined) ?? null;

  if (!isStorableMeta(meta)) {
    res.status(400).json({ error: "meta must be a JSON object string" });
    return;
  }

  // Photos and reel thumbnails both arrive as base64 data URLs — store in image_data
  const isDataUrl = (imageUrl ?? "").startsWith("data:");
  const imageUrlDb = isDataUrl ? null : (imageUrl ?? null);
  const imageDataDb = isDataUrl ? (imageUrl ?? null) : null;

  try {
    const result = await pool.query(
      `INSERT INTO items
         (id, type, url, title, subtitle, image_url, size,
          position_x, position_y, added_at, image_data, note, board, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7, 0,0,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        id,
        type,
        url ?? null,
        title ?? null,
        subtitle ?? null,
        imageUrlDb,
        String(size ?? 320),
        addedAt ?? new Date().toISOString(),
        imageDataDb,
        note,
        board ?? "moodboard",
        meta ?? null,
      ],
    );
    res.json(rowToItem(result.rows[0]));
  } catch {
    res.status(500).json({ error: "Failed to create item" });
  }
});

router.delete("/items/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM items WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete item" });
  }
});

router.patch("/items/:id", async (req, res) => {
  const body = req.body as {
    completed?: boolean;
    pinned?: boolean;
    note?: string | null;
    title?: string | null;
    imageUrl?: string | null;
    subtitle?: string | null;
    meta?: string | null;
  };

  if (!isStorableMeta(body.meta)) {
    res.status(400).json({ error: "meta must be a JSON object string" });
    return;
  }

  try {
    if (body.completed !== undefined) {
      await pool.query("UPDATE items SET completed = $1 WHERE id = $2", [
        body.completed,
        req.params.id,
      ]);
    }
    if (body.pinned !== undefined) {
      await pool.query("UPDATE items SET pinned = $1 WHERE id = $2", [
        body.pinned,
        req.params.id,
      ]);
    }
    if ("note" in body) {
      await pool.query("UPDATE items SET note = $1 WHERE id = $2", [
        body.note ?? null,
        req.params.id,
      ]);
    }
    if ("title" in body) {
      await pool.query("UPDATE items SET title = $1 WHERE id = $2", [
        body.title ?? null,
        req.params.id,
      ]);
    }
    if ("subtitle" in body) {
      await pool.query("UPDATE items SET subtitle = $1 WHERE id = $2", [
        body.subtitle ?? null,
        req.params.id,
      ]);
    }
    if ("meta" in body) {
      await pool.query("UPDATE items SET meta = $1 WHERE id = $2", [
        body.meta ?? null,
        req.params.id,
      ]);
    }
    if ("imageUrl" in body) {
      const imageUrl = body.imageUrl ?? null;
      const isDataUrl = typeof imageUrl === "string" && imageUrl.startsWith("data:");
      if (isDataUrl) {
        await pool.query(
          "UPDATE items SET image_data = $1, image_url = NULL WHERE id = $2",
          [imageUrl, req.params.id],
        );
      } else {
        await pool.query(
          "UPDATE items SET image_url = $1, image_data = NULL WHERE id = $2",
          [imageUrl, req.params.id],
        );
      }
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to update item" });
  }
});

router.post("/items/refresh-prices", async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, url FROM items WHERE board = 'discover' AND type = 'link' AND url IS NOT NULL",
    );
    const rows = result.rows as Array<{ id: string; url: string }>;
    const updated = await mapWithConcurrency(rows, 4, (row) =>
      refreshItemPriceRow(row.id, row.url),
    );
    res.json({ items: updated.filter((item) => item !== null) });
  } catch {
    res.status(500).json({ error: "Failed to refresh prices" });
  }
});

router.post("/items/:id/refresh-price", async (req, res) => {
  try {
    const existing = await pool.query("SELECT url FROM items WHERE id = $1", [req.params.id]);
    const url = existing.rows[0]?.url as string | undefined;
    if (!url) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    const item = await refreshItemPriceRow(req.params.id, url);
    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    res.json(item);
  } catch {
    res.status(500).json({ error: "Failed to refresh price" });
  }
});

export default router;
