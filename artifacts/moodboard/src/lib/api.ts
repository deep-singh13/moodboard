import type { MoodboardItem, MovieResult } from "@/types";

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

export async function patchItemNote(
  id: string,
  note: string | null,
): Promise<void> {
  const res = await fetch(`${BASE}/items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
  });
  if (!res.ok) throw new Error(`Failed to update note: ${res.status}`);
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

export async function fetchMovieSearch(q: string): Promise<MovieResult[]> {
  try {
    const res = await fetch(
      `${BASE}/movie-search?q=${encodeURIComponent(q)}`,
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function fetchMovieDetail(imdbId: string): Promise<MovieResult | null> {
  try {
    const res = await fetch(`${BASE}/movie-detail/${encodeURIComponent(imdbId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    // Empty object means detail fetch failed
    if (!data.title) return null;
    return data as MovieResult;
  } catch {
    return null;
  }
}
