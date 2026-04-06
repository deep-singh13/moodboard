import type { MoodboardItem } from "@/types";

const BASE = "/api";

export async function fetchItems(): Promise<MoodboardItem[]> {
  const res = await fetch(`${BASE}/items`);
  if (!res.ok) throw new Error(`Failed to fetch items: ${res.status}`);
  return res.json();
}

export async function createItem(item: MoodboardItem): Promise<MoodboardItem> {
  const res = await fetch(`${BASE}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error(`Failed to create item: ${res.status}`);
  return res.json();
}

export async function deleteItem(id: string): Promise<void> {
  const res = await fetch(`${BASE}/items/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete item: ${res.status}`);
}

export async function patchItemComplete(
  id: string,
  completed: boolean,
): Promise<void> {
  const res = await fetch(`${BASE}/items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed }),
  });
  if (!res.ok) throw new Error(`Failed to update item: ${res.status}`);
}

export async function fetchOgMeta(url: string): Promise<{
  title?: string;
  description?: string;
  image?: string;
}> {
  const res = await fetch(`${BASE}/fetch-og?url=${encodeURIComponent(url)}`);
  if (!res.ok) return {};
  return res.json();
}
