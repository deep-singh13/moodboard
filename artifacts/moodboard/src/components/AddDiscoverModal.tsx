import { useState, useRef, useEffect, useCallback } from "react";
import type { MoodboardItem, MovieResult } from "@/types";
import { fetchMovieSearch, fetchMovieDetail, fetchOgMeta } from "@/lib/api";
import { compressImage } from "@/lib/imageUtils";
import { encodeMovieMeta, encodeReelMeta } from "@/lib/itemMeta";
import { getDomain, normalizeUrl } from "@/lib/urlUtils";
import { ModalShell } from "@/components/ModalShell";
import { ModalTypeTabs } from "@/components/ModalTypeTabs";
import { UploadPhotoButton } from "@/components/UploadPhotoButton";

interface AddDiscoverModalProps {
  onClose: () => void;
  onAdd: (item: MoodboardItem) => void;
}

type TabType = "movie" | "reel" | "link";

const TABS: Array<{ value: TabType; label: string }> = [
  { value: "movie", label: "🎬 Movie" },
  { value: "reel", label: "▶ Reel" },
  { value: "link", label: "🔗 Link" },
];

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

  const handleReelThumbnail = async (file: File) => {
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
        const meta = encodeMovieMeta({
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
        const trimmed = reelUrl.trim();
        if (!trimmed) { setError("Please enter a URL."); setLoading(false); return; }
        const url = normalizeUrl(trimmed);
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
          meta: encodeReelMeta({ username, reel_url: url }),
          size: 320,
          addedAt: new Date().toISOString(),
        };
      } else {
        // Link
        const trimmed = linkUrl.trim();
        if (!trimmed) { setError("Please enter a URL."); setLoading(false); return; }
        const url = normalizeUrl(trimmed);
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
    <ModalShell onClose={onClose} label="Add to Discover">
        <ModalTypeTabs
          tabs={TABS}
          active={tab}
          onChange={(t) => { setTab(t); setError(null); }}
        />

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
            <UploadPhotoButton
              hasFile={!!reelThumbnail}
              label={reelThumbnail ? "Thumbnail uploaded ✓" : "Upload thumbnail (optional)"}
              onFileSelect={handleReelThumbnail}
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
    </ModalShell>
  );
}
