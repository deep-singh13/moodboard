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
    imageUrl: (row.image_url as string | null) ?? (row.image_data as string | null) ?? undefined,
    size: row.size ? Number(row.size) : undefined,
    addedAt: row.added_at,
    completed: row.completed ?? false,
    note: (row.note as string | null) ?? undefined,
  };
}

router.get("/items", async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM items ORDER BY added_at ASC",
    );
    res.json(result.rows.map(rowToItem));
  } catch {
    res.status(500).json({ error: "Failed to fetch items" });
  }
});

router.post("/items", async (req, res) => {
  const { id, type, url, title, subtitle, imageUrl, size, addedAt } = req.body as Record<string, string>;

  const isPhoto = type === "photo";
  const imageUrlDb = isPhoto ? null : (imageUrl ?? null);
  const imageDataDb = isPhoto ? (imageUrl ?? null) : null;

  try {
    const result = await pool.query(
      `INSERT INTO items
         (id, type, url, title, subtitle, image_url, size, position_x, position_y, added_at, image_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, $8, $9)
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
  const body = req.body as { completed?: boolean; note?: string | null };
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
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to update item" });
  }
});

export default router;
