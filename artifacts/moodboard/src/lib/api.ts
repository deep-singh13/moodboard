import type {
  MoodboardItem,
  MovieResult,
  PlaceDetail,
  PlaceSearchResult,
} from "@/types";

const BASE = "/api";

export async function fetchItems(board: string = "moodboard"): Promise<MoodboardItem[]> {
  const res = await fetch(`${BASE}/items?board=${encodeURIComponent(board)}`);
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

/** Partial update of a saved item. Every field is optional; omit one to leave
 *  it untouched. Sending an explicit null clears it. */
export async function patchItemEdit(
  id: string,
  updates: {
    title?: string | null;
    imageUrl?: string | null;
    subtitle?: string | null;
    meta?: string | null;
    note?: string | null;
    completed?: boolean;
    pinned?: boolean;
  },
): Promise<void> {
  const res = await fetch(`${BASE}/items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Failed to update item: ${res.status}`);
}

export async function refreshItemPrice(id: string): Promise<MoodboardItem> {
  const res = await fetch(`${BASE}/items/${id}/refresh-price`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to refresh price: ${res.status}`);
  return res.json();
}

export async function refreshAllPrices(): Promise<MoodboardItem[]> {
  const res = await fetch(`${BASE}/items/refresh-prices`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to refresh prices: ${res.status}`);
  const data = (await res.json()) as { items: MoodboardItem[] };
  return data.items;
}

export async function fetchOgMeta(url: string): Promise<{
  title?: string;
  description?: string;
  image?: string;
  fetchFailed?: boolean;
  blockedHost?: boolean;
}> {
  try {
    const res = await fetch(`${BASE}/fetch-og?url=${encodeURIComponent(url)}`);
    if (!res.ok) return { fetchFailed: true };
    return res.json();
  } catch {
    return { fetchFailed: true };
  }
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

export async function fetchPlaceSearch(q: string): Promise<PlaceSearchResult[]> {
  try {
    const res = await fetch(`${BASE}/place-search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function fetchPlaceDetail(url: string): Promise<PlaceDetail | null> {
  try {
    const res = await fetch(`${BASE}/place-detail?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.name) return null;
    return data as PlaceDetail;
  } catch {
    return null;
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
