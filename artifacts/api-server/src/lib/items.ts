import { pool } from "./db";
import {
  assertValidBoard,
  assertValidId,
  assertValidMeta,
  assertValidType,
  buildUpdateAssignments,
  imageColumns,
  type ItemPatch,
} from "./itemValidation";

/* ---------------------------------------------------------------------------
 * The Items repository — every statement that touches the `items` table, in
 * one place. Routes call this and translate the result to HTTP; they don't
 * build SQL, decide storage policy, or validate.
 *
 * This used to be interleaved across six route handlers: `POST /items` and
 * `PATCH /items/:id` each re-derived the data-URL storage policy, and PATCH
 * fired up to seven separate UPDATE statements — one per field, each with its
 * own hand-numbered `$1`/`$2` — with no transaction, so a mid-way failure left
 * a partial write and a 500. `update()` below is one statement built from
 * `buildUpdateAssignments` (itemValidation.ts), so a partial update is no
 * longer a state the database can be left in — a single Postgres statement
 * either applies in full or not at all.
 *
 * Validation lives one level down for the same reason accepting `pool` as a
 * parameter would in a smaller module: itemValidation.ts imports nothing from
 * `./db`, so it — and the column-assignment logic specifically — can be unit
 * tested without a live Postgres connection. This file is the one that can't
 * be: `./db` throws at import time without DATABASE_URL, same as every other
 * module in this codebase that touches the pool.
 * ------------------------------------------------------------------------ */

export interface Item {
  id: unknown;
  type: unknown;
  url: string | undefined;
  title: string | undefined;
  subtitle: string | undefined;
  imageUrl: string | undefined;
  size: number | undefined;
  addedAt: unknown;
  completed: unknown;
  pinned: unknown;
  note: string | undefined;
  board: string;
  meta: string | undefined;
  price: number | undefined;
  currency: string | undefined;
  availability: string | undefined;
  priceUpdatedAt: string | undefined;
}

export interface NewItem {
  id: unknown;
  type: unknown;
  url?: string | null;
  title?: string | null;
  subtitle?: string | null;
  imageUrl?: string | null;
  size?: number | string | null;
  addedAt?: string | null;
  board?: unknown;
  meta?: string | null;
  note?: string | null;
}

function rowToItem(row: Record<string, unknown>): Item {
  return {
    id: row.id,
    type: row.type,
    url: (row.url as string | null) ?? undefined,
    title: (row.title as string | null) ?? undefined,
    subtitle: (row.subtitle as string | null) ?? undefined,
    imageUrl:
      (row.image_url as string | null) ?? (row.image_data as string | null) ?? undefined,
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

export async function listByBoard(board: string): Promise<Item[]> {
  // Unlike insert(), a read doesn't validate `board` against the known set —
  // an unrecognized board just yields zero rows, which is harmless. Rejecting
  // it here would only turn a typo'd query string into a 400 for no benefit;
  // insert() validates because bad data written there persists.
  const result = await pool.query(
    "SELECT * FROM items WHERE board = $1 ORDER BY pinned DESC, added_at DESC",
    [board],
  );
  return result.rows.map(rowToItem);
}

export async function insert(input: NewItem): Promise<Item> {
  assertValidId(input.id);
  assertValidType(input.type);
  assertValidBoard(input.board);
  assertValidMeta(input.meta);

  const { imageUrlColumn, imageDataColumn } = imageColumns(input.imageUrl);

  const result = await pool.query(
    `INSERT INTO items
       (id, type, url, title, subtitle, image_url, size,
        position_x, position_y, added_at, image_data, note, board, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7, 0,0,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      input.id,
      input.type,
      input.url ?? null,
      input.title ?? null,
      input.subtitle ?? null,
      imageUrlColumn,
      String(input.size ?? 320),
      input.addedAt ?? new Date().toISOString(),
      imageDataColumn,
      input.note ?? null,
      input.board ?? "moodboard",
      input.meta ?? null,
    ],
  );
  return rowToItem(result.rows[0]);
}

export async function update(id: string, patch: ItemPatch): Promise<Item | null> {
  assertValidMeta(patch.meta);

  const assignments = buildUpdateAssignments(patch);
  if (assignments.length === 0) {
    const result = await pool.query("SELECT * FROM items WHERE id = $1", [id]);
    return result.rows[0] ? rowToItem(result.rows[0]) : null;
  }

  const setClause = assignments.map((a, i) => `${a.column} = $${i + 1}`).join(", ");
  const values = [...assignments.map((a) => a.value), id];
  const result = await pool.query(
    `UPDATE items SET ${setClause} WHERE id = $${assignments.length + 1} RETURNING *`,
    values,
  );
  return result.rows[0] ? rowToItem(result.rows[0]) : null;
}

export async function remove(id: string): Promise<boolean> {
  const result = await pool.query("DELETE FROM items WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function findUrlById(id: string): Promise<string | undefined> {
  const result = await pool.query("SELECT url FROM items WHERE id = $1", [id]);
  return (result.rows[0]?.url as string | undefined) ?? undefined;
}

/** Every board=discover, type=link item with a URL — the eligible set for a
 *  bulk price refresh. Was a literal string in the route handler; the rule
 *  for "what's refreshable" belongs with the rest of what this table means,
 *  not embedded in the code that happens to trigger the refresh. */
export async function listRefreshableLinks(): Promise<Array<{ id: string; url: string }>> {
  const result = await pool.query(
    "SELECT id, url FROM items WHERE board = 'discover' AND type = 'link' AND url IS NOT NULL",
  );
  return result.rows as Array<{ id: string; url: string }>;
}

export interface PriceInfo {
  price: number | null;
  currency: string | null;
  availability: string;
}

export async function updatePriceInfo(id: string, info: PriceInfo): Promise<Item | null> {
  const result = await pool.query(
    `UPDATE items
       SET price = $1, currency = $2, availability = $3, price_updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
    [info.price, info.currency, info.availability, id],
  );
  return result.rows[0] ? rowToItem(result.rows[0]) : null;
}
