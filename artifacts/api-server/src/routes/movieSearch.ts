import { Router, type IRouter } from "express";

const router: IRouter = Router();

interface OmdbSearchItem {
  Title: string;
  Year: string;
  imdbID: string;
  Poster: string;
}

interface OmdbSearchResponse {
  Search?: OmdbSearchItem[];
  Response: string;
}

interface OmdbDetailResponse {
  Title?: string;
  Year?: string;
  Genre?: string;
  imdbRating?: string;
  Poster?: string;
  imdbID?: string;
  Director?: string;
  Response: string;
}

// GET /api/movie-search?q=<title>
// Returns up to 5 basic results (title, year, poster, imdbId)
router.get("/movie-search", async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  if (!q) {
    res.json([]);
    return;
  }

  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey) {
    res.json([]);
    return;
  }

  try {
    const url = `https://www.omdbapi.com/?apikey=${apiKey}&s=${encodeURIComponent(q)}&type=movie`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) { res.json([]); return; }

    const data = (await response.json()) as OmdbSearchResponse;
    if (data.Response !== "True" || !data.Search) { res.json([]); return; }

    res.json(
      data.Search.slice(0, 5).map((item) => ({
        title: item.Title,
        year: item.Year,
        posterUrl: item.Poster !== "N/A" ? item.Poster : "",
        imdbId: item.imdbID,
      })),
    );
  } catch {
    res.json([]);
  }
});

// GET /api/movie-detail/:imdbId
// Returns full metadata for a single movie (genre, rating, director)
router.get("/movie-detail/:imdbId", async (req, res) => {
  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey) { res.json({}); return; }

  try {
    const url = `https://www.omdbapi.com/?apikey=${apiKey}&i=${req.params.imdbId}&type=movie`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) { res.json({}); return; }

    const data = (await response.json()) as OmdbDetailResponse;
    if (data.Response !== "True") { res.json({}); return; }

    res.json({
      title: data.Title ?? "",
      year: data.Year ?? "",
      genre: data.Genre?.split(",")[0]?.trim() ?? "",
      rating: data.imdbRating ?? "",
      posterUrl: data.Poster !== "N/A" ? (data.Poster ?? "") : "",
      imdbId: data.imdbID ?? "",
      director: data.Director ?? "",
    });
  } catch {
    res.json({});
  }
});

export default router;
