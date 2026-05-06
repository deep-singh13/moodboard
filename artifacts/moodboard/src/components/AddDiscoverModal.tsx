import { useState, useRef, useEffect, useCallback } from "react";
import type { MoodboardItem, MovieResult } from "@/types";
import { fetchMovieSearch, fetchMovieDetail, fetchOgMeta } from "@/lib/api";
import { compressImage } from "@/lib/imageUtils";

interface AddDiscoverModalProps {
  onClose: () => void;
  onAdd: (item: MoodboardItem) => void;
}

type TabType = "movie" | "reel" | "link";

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace("www.", ""); }
  catch { return url; }
}

function extractInstagramUsername(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "stories" && parts[1]) return `@${parts[1]}`;
    if (parts[0] && parts[0] !== "reel" && parts[0] !== "p" && parts[0] !== "reels") {
      return `@${parts[0]}`;
    }
    return "Instagram Reel";
  } catch { return "Instagram Reel"; }
}

export function AddDiscoverModal({ onClose, onAdd }: AddDiscoverModalProps) {
  const [tab, setTab] = useState<TabType>("movie");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Movie tab state
  const [movieQuery, setMovieQuery] = useState("");
  const [movieResults, setMovieResults] = useState<MovieResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<MovieResult | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reel tab state
  const [reelUrl, setReelUrl] = useState("");
  const [reelCaption, setReelCaption] = useState("");
  const [reelThumbnail, setReelThumbnail] = useState<string | null>(null);
  const reelFileRef = useRef<HTMLInputElement>(null);

  // Link tab state
  const [linkUrl, setLinkUrl] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Debounced movie search
  const handleMovieQueryChange = useCallback((q: string) => {
    setMovieQuery(q);
    setSelectedMovie(null);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!q.trim()) { setMovieResults([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      const results = await fetchMovieSearch(q.trim());
      setMovieResults(results);
      setSearchLoading(false);
    }, 300);
  }, []);

  const handleSelectMovie = async (result: MovieResult) => {
    setSelectedMovie(result);
    // Fetch full details to get genre, rating, director
    setDetailLoading(true);
    const detail = await fetchMovieDetail(result.imdbId);
    if (detail) setSelectedMovie(detail);
    setDetailLoading(false);
  };

  const handleReelThumbnail = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImage(file, 800, 0.82);
      setReelThumbnail(dataUrl);
    } catch {
      setError("Couldn't process that image.");
    }
  };

  const handleAdd = async () => {
    setError(null);
    setLoading(true);

    try {
      let item: MoodboardItem;

      if (tab === "movie") {
        if (!selectedMovie) return;
        const meta = JSON.stringify({
          year: selectedMovie.year ?? "",
          genre: selectedMovie.genre ?? "",
          rating: selectedMovie.rating ?? "",
          director: selectedMovie.director ?? "",
          imdbId: selectedMovie.imdbId,
        });
        item = {
          id: crypto.randomUUID(),
          type: "movie",
          board: "discover",
          url: `https://www.imdb.com/title/${selectedMovie.imdbId}`,
          title: selectedMovie.title,
          subtitle: [selectedMovie.year, selectedMovie.genre].filter(Boolean).join(" · "),
          imageUrl: selectedMovie.posterUrl || undefined,
          meta,
          size: 320,
          addedAt: new Date().toISOString(),
        };
      } else if (tab === "reel") {
        let url = reelUrl.trim();
        if (!url) { setError("Please enter a URL."); setLoading(false); return; }
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;
        const username = reelCaption.trim() || extractInstagramUsername(url);
        // Auto-fetch thumbnail if none manually uploaded
        let autoThumb: string | undefined = reelThumbnail || undefined;
        if (!autoThumb) {
          const og = await fetchOgMeta(url);
          autoThumb = og.image;
        }
        item = {
          id: crypto.randomUUID(),
          type: "reel",
          board: "discover",
          url,
          title: username,
          subtitle: "Instagram",
          imageUrl: autoThumb,
          meta: JSON.stringify({ username, reel_url: url }),
          size: 320,
          addedAt: new Date().toISOString(),
        };
      } else {
        // Link
        let url = linkUrl.trim();
        if (!url) { setError("Please enter a URL."); setLoading(false); return; }
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;
        const og = await fetchOgMeta(url);
        const domain = getDomain(url);
        item = {
          id: crypto.randomUUID(),
          type: "link",
          board: "discover",
          url,
          title: og.title ?? domain,
          subtitle: domain,
          imageUrl: og.image,
          size: 320,
          addedAt: new Date().toISOString(),
        };
      }

      onAdd(item);
      onClose();
    } catch {
      setError("Something went wrong — please try again.");
    } finally {
      setLoading(false);
    }
  };

  const canAdd =
    !loading &&
    (tab === "movie" ? !!selectedMovie && !detailLoading :
     tab === "reel"  ? !!reelUrl.trim() :
     !!linkUrl.trim());

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="modal-drawer">
        <div className="modal-handle" />
        <p className="modal-label">Add to Discover</p>

        {/* Tab switcher */}
        <div className="modal-type-tabs">
          {(["movie", "reel", "link"] as TabType[]).map((t) => (
            <button
              key={t}
              className={`modal-type-tab ${tab === t ? "active" : ""}`}
              onClick={() => { setTab(t); setError(null); }}
            >
              {t === "movie" ? "🎬 Movie" : t === "reel" ? "▶ Reel" : "🔗 Link"}
            </button>
          ))}
        </div>

        {/* Movie tab */}
        {tab === "movie" && (
          <>
            <input
              ref={inputRef}
              className="modal-input"
              placeholder="Search for a movie title…"
              value={movieQuery}
              onChange={(e) => handleMovieQueryChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && canAdd) handleAdd(); }}
            />
            {searchLoading && (
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
                Searching…
              </p>
            )}
            {!searchLoading && movieQuery && movieResults.length === 0 && (
              <p className="movie-no-results">No results — try a different title</p>
            )}
            {movieResults.length > 0 && (
              <div className="movie-results">
                {movieResults.map((r) => (
                  <div
                    key={r.imdbId}
                    className={`movie-result ${selectedMovie?.imdbId === r.imdbId ? "selected" : ""}`}
                    onClick={() => handleSelectMovie(r)}
                  >
                    {r.posterUrl ? (
                      <img src={r.posterUrl} alt={r.title} className="movie-result-poster" />
                    ) : (
                      <div className="movie-result-poster" />
                    )}
                    <div>
                      <div className="movie-result-title">{r.title}</div>
                      <div className="movie-result-meta">
                        {detailLoading && selectedMovie?.imdbId === r.imdbId
                          ? "Loading details…"
                          : [r.year, selectedMovie?.imdbId === r.imdbId ? selectedMovie.genre : ""]
                              .filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Reel tab */}
        {tab === "reel" && (
          <>
            <input
              ref={tab === "reel" ? inputRef : undefined}
              className="modal-input"
              type="url"
              placeholder="Paste Instagram reel URL…"
              value={reelUrl}
              onChange={(e) => setReelUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && canAdd) handleAdd(); }}
            />
            <input
              className="modal-input"
              placeholder="Caption or @username (optional)"
              value={reelCaption}
              onChange={(e) => setReelCaption(e.target.value)}
            />
            <button
              className={`modal-upload-btn ${reelThumbnail ? "has-file" : ""}`}
              onClick={() => reelFileRef.current?.click()}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
              {reelThumbnail ? "Thumbnail uploaded ✓" : "Upload thumbnail (optional)"}
            </button>
            <input
              ref={reelFileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleReelThumbnail}
            />
          </>
        )}

        {/* Link tab */}
        {tab === "link" && (
          <input
            ref={tab === "link" ? inputRef : undefined}
            className="modal-input"
            type="url"
            placeholder="Paste any website URL…"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && canAdd) handleAdd(); }}
          />
        )}

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn-primary"
            onClick={handleAdd}
            disabled={!canAdd}
          >
            {loading ? "Adding…" : "Add to Discover"}
          </button>
        </div>
      </div>
    </div>
  );
}
