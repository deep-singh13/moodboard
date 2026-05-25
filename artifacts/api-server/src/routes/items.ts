import { Router, type IRouter } from "express";
import { pool } from "../lib/db";

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
    note: (row.note as string | null) ?? undefined,
    board: (row.board as string | null) ?? "moodboard",
    meta: (row.meta as string | null) ?? undefined,
  };
}

router.get("/items", async (req, res) => {
  const board = (req.query.board as string | undefined) ?? "moodboard";
  try {
    const result = await pool.query(
      "SELECT * FROM items WHERE board = $1 ORDER BY added_at ASC",
      [board],
    );
    res.json(result.rows.map(rowToItem));
  } catch {
    res.status(500).json({ error: "Failed to fetch items" });
  }
});

router.post("/items", async (req, res) => {
  const body = req.body as Record<string, string | null | undefined>;
  const { id, type, url, title, subtitle, imageUrl, size, addedAt, board, meta } =
    body;
  const note = (body.note as string | null | undefined) ?? null;

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
    note?: string | null;
    title?: string | null;
    imageUrl?: string | null;
    subtitle?: string | null;
    meta?: string | null;
  };
  try {
    if (body.completed !== undefined) {
      await pool.query("UPDATE items SET completed = $1 WHERE id = $2", [
        body.completed,
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

export default router;
