export interface MoodboardItem {
  id: string;
  type:
    | "substack"
    | "youtube"
    | "link"
    | "photo"
    | "movie"
    | "reel"
    | "quote"
    | "place";
  url: string;
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  size?: number;
  gridX?: number;
  gridY?: number;
  addedAt: string;
  completed?: boolean;
  pinned?: boolean;
  note?: string;
  board?: string;  // 'moodboard' | 'discover' — undefined treated as 'moodboard'
  meta?: string;   // JSON string; type-specific extras, parsed by consumers
  price?: number;
  currency?: string;
  availability?: "in_stock" | "out_of_stock" | "unknown";
  priceUpdatedAt?: string;
}

/** One candidate from the locally ingested District restaurant index. Carries
 *  only enough to render a pickable row — real details arrive from
 *  /api/place-detail once the user chooses one. */
export interface PlaceSearchResult {
  slug: string;
  city: string;
  url: string;
  label: string;
}

/** A District restaurant page, scraped. Menu pages and photos are Zomato CDN
 *  URLs; only coverImage is inlined as a compressed data URL. */
export interface PlaceDetail {
  name: string;
  address?: string;
  locality?: string;
  lat?: number;
  lng?: number;
  cuisines: string[];
  priceForTwo?: string;
  rating?: number;
  ratingCount?: number;
  phone?: string;
  hours?: string;
  coverImage?: string;
  photos: string[];
  menuImages: string[];
  districtUrl: string;
}

/** Shape of the `meta` JSON stored on a saved place item. */
export interface PlaceMeta {
  address?: string;
  locality?: string;
  lat?: number;
  lng?: number;
  mapsUrl?: string;
  cuisines?: string[];
  priceForTwo?: string;
  rating?: number;
  ratingCount?: number;
  phone?: string;
  hours?: string;
  photos?: string[];
  menuImages?: string[];
  source?: "district" | "manual";
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
