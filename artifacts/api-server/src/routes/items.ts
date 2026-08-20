import { Router, type IRouter, type Response } from "express";
import * as items from "../lib/items";
import { InvalidItemError, type ItemPatch } from "../lib/itemValidation";
import { mapWithConcurrency } from "../lib/concurrency";
import { fetchPriceInfo } from "../lib/fetchPrice";

const router: IRouter = Router();

/** Maps a repository failure to a response. A validation failure is the
 *  caller's fault (400, with the actual reason); anything else is logged —
 *  the previous bare `catch {}` here meant a constraint violation and a
 *  connection failure were indistinguishable in the logs — and reported as a
 *  generic 500, since the caller can't act on a database internals message. */
function respondToError(res: Response, action: string, err: unknown): void {
  if (err instanceof InvalidItemError) {
    res.status(400).json({ error: err.message });
    return;
  }
  console.error(`[items] ${action} failed:`, err);
  res.status(500).json({ error: `Failed to ${action}` });
}

router.get("/items", async (req, res) => {
  const board = (req.query.board as string | undefined) ?? "moodboard";
  try {
    res.json(await items.listByBoard(board));
  } catch (err) {
    respondToError(res, "fetch items", err);
  }
});

router.post("/items", async (req, res) => {
  try {
    const item = await items.insert(req.body as items.NewItem);
    res.json(item);
  } catch (err) {
    respondToError(res, "create item", err);
  }
});

router.delete("/items/:id", async (req, res) => {
  try {
    const deleted = await items.remove(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    respondToError(res, "delete item", err);
  }
});

router.patch("/items/:id", async (req, res) => {
  try {
    const item = await items.update(req.params.id, req.body as ItemPatch);
    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    res.json(item);
  } catch (err) {
    respondToError(res, "update item", err);
  }
});

router.post("/items/refresh-prices", async (_req, res) => {
  try {
    const links = await items.listRefreshableLinks();
    const updated = await mapWithConcurrency(links, 4, async ({ id, url }) => {
      const info = await fetchPriceInfo(url);
      return items.updatePriceInfo(id, {
        price: info.price ?? null,
        currency: info.currency ?? null,
        availability: info.availability ?? "unknown",
      });
    });
    res.json({ items: updated.filter((item) => item !== null) });
  } catch (err) {
    respondToError(res, "refresh prices", err);
  }
});

router.post("/items/:id/refresh-price", async (req, res) => {
  try {
    const url = await items.findUrlById(req.params.id);
    if (!url) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    const info = await fetchPriceInfo(url);
    const item = await items.updatePriceInfo(req.params.id, {
      price: info.price ?? null,
      currency: info.currency ?? null,
      availability: info.availability ?? "unknown",
    });
    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    res.json(item);
  } catch (err) {
    respondToError(res, "refresh price", err);
  }
});

export default router;
