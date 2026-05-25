export interface MoodboardItem {
  id: string;
  type: "substack" | "youtube" | "link" | "photo" | "movie" | "reel" | "quote";
  url: string;
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  size?: number;
  gridX?: number;
  gridY?: number;
  addedAt: string;
  completed?: boolean;
  note?: string;
  board?: string;  // 'moodboard' | 'discover' — undefined treated as 'moodboard'
  meta?: string;   // JSON string; type-specific extras, parsed by consumers
}

export interface MovieResult {
  title: string;
  year: string;
  posterUrl: string;
  imdbId: string;
  // Present only from /api/movie-detail — absent from /api/movie-search results
  genre?: string;
  rating?: string;
  director?: string;
}
