/* ---------------------------------------------------------------------------
 * Pure rules for what an `items` row may contain — no `pool`, no network, so
 * this module can be imported (and tested) without a live Postgres connection
 * or DATABASE_URL, unlike everything that touches ./db.
 *
 * There is no schema shared between the client and the server for this table
 * (CLAUDE.md: Drizzle/Zod/api-spec exist but aren't on the code path), so
 * ITEM_TYPES and BOARDS below are the server's own copy of unions the client
 * declares independently in types/index.ts. Keeping them here — rather than
 * skipping validation because "the client already checks" — is what stops a
 * malformed row from being written at all; the client can't be trusted to be
 * the only writer (the Chrome extension is a second one).
 * ------------------------------------------------------------------------ */

export const ITEM_TYPES = new Set([
  "substack",
  "youtube",
  "link",
  "photo",
  "movie",
  "reel",
  "quote",
  "place",
]);

export const BOARDS = new Set(["moodboard", "discover", "quotes", "places"]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Thrown by validation — routes translate this to 400, anything else to 500. */
export class InvalidItemError extends Error {}

export function assertValidId(id: unknown): asserts id is string {
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    throw new InvalidItemError(`id must be a UUID, got: ${JSON.stringify(id)}`);
  }
}

export function assertValidType(type: unknown): asserts type is string {
  if (typeof type !== "string" || !ITEM_TYPES.has(type)) {
    throw new InvalidItemError(`Unknown item type: ${JSON.stringify(type)}`);
  }
}

/** Unlike type, board defaults rather than being required — both the client
 *  and the extension may omit it and mean "moodboard". */
export function assertValidBoard(board: unknown): asserts board is string | undefined {
  if (board !== undefined && (typeof board !== "string" || !BOARDS.has(board))) {
    throw new InvalidItemError(`Unknown board: ${JSON.stringify(board)}`);
  }
}

/** `meta` is stored as an opaque JSON string; nothing downstream can tell a
 *  malformed payload from an absent one, since every client reader falls back
 *  to {} on a parse failure. Rejecting non-JSON here keeps the column honest. */
export function assertValidMeta(meta: unknown): asserts meta is string | null | undefined {
  if (meta === null || meta === undefined) return;
  if (typeof meta !== "string") {
    throw new InvalidItemError("meta must be a JSON object string");
  }
  try {
    const parsed: unknown = JSON.parse(meta);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new InvalidItemError("meta must be a JSON object string");
    }
  } catch (err) {
    if (err instanceof InvalidItemError) throw err;
    throw new InvalidItemError("meta must be a JSON object string");
  }
}

export interface ImageColumns {
  imageUrlColumn: string | null;
  imageDataColumn: string | null;
}

/** Where an image URL is stored depends on what it *is*, not who's asking:
 *  photos and reel thumbnails arrive as base64 data URLs and go in
 *  image_data; everything else is a link and goes in image_url. This is the
 *  one place that decision gets made — insert and update both call it,
 *  instead of each re-deriving it. */
export function imageColumns(imageUrl: string | null | undefined): ImageColumns {
  const isDataUrl = (imageUrl ?? "").startsWith("data:");
  return {
    imageUrlColumn: isDataUrl ? null : (imageUrl ?? null),
    imageDataColumn: isDataUrl ? (imageUrl ?? null) : null,
  };
}

export interface ItemPatch {
  completed?: boolean;
  pinned?: boolean;
  note?: string | null;
  title?: string | null;
  subtitle?: string | null;
  meta?: string | null;
  imageUrl?: string | null;
}

export interface ColumnAssignment {
  column: string;
  value: unknown;
}

/** Turns a patch into the column/value pairs an UPDATE needs to set — the
 *  piece that used to be seven separate `if (x in body) await pool.query(...)`
 *  blocks, each hand-numbering its own `$1`/`$2`. Building this list is pure
 *  (no query, no $N placeholders yet), so the presence logic and the
 *  imageUrl-splits-into-two-columns case are both testable without a
 *  database — including the off-by-one that a positional param list invites
 *  when a field is added. `update()` in items.ts turns this into the actual
 *  SET clause. */
export function buildUpdateAssignments(patch: ItemPatch): ColumnAssignment[] {
  const assignments: ColumnAssignment[] = [];
  if ("completed" in patch) assignments.push({ column: "completed", value: patch.completed });
  if ("pinned" in patch) assignments.push({ column: "pinned", value: patch.pinned });
  if ("note" in patch) assignments.push({ column: "note", value: patch.note ?? null });
  if ("title" in patch) assignments.push({ column: "title", value: patch.title ?? null });
  if ("subtitle" in patch) {
    assignments.push({ column: "subtitle", value: patch.subtitle ?? null });
  }
  if ("meta" in patch) assignments.push({ column: "meta", value: patch.meta ?? null });
  if ("imageUrl" in patch) {
    const { imageUrlColumn, imageDataColumn } = imageColumns(patch.imageUrl);
    assignments.push({ column: "image_url", value: imageUrlColumn });
    assignments.push({ column: "image_data", value: imageDataColumn });
  }
  return assignments;
}
