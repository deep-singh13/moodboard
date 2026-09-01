import { useState, useRef, useEffect, useCallback } from "react";
import type { MoodboardItem, MovieResult } from "@/types";
import { fetchMovieSearch, fetchMovieDetail, fetchOgMeta } from "@/lib/api";
import { compressImage } from "@/lib/imageUtils";
import { encodeMovieMeta, encodeReelMeta } from "@/lib/itemMeta";
import { getDomain, normalizeUrl } from "@/lib/urlUtils";
import { ModalShell } from "@/components/ModalShell";
import { ModalTypeTabs } from "@/components/ModalTypeTabs";
import { UploadPhotoButton } from "@/components/UploadPhotoButton";
import type { ItemPatch } from "@/lib/useBoard";

interface AddDiscoverModalProps {
  onClose: () => void;
  onAdd: (item: MoodboardItem) => void;
  onUpdate: (id: string, patch: ItemPatch) => void;
  /** A reel or link was added without a thumbnail and the background OG
   *  fetch didn't find one either — the page may want to prompt the user to
   *  add one manually (see discover.tsx's thumbnail toast). */
  onMissingThumbnail: () => void;
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

export function AddDiscoverModal({ onClose, onAdd, onUpdate, onMissingThumbnail }: AddDiscoverModalProps) {
  const [tab, setTab] = useState<TabType>("movie");
  const [error, setError] = useState<string | null>(null);

  // Movie tab state
  const [movieQuery, setMovieQuery] = useState("");
  const [movieResults, setMovieResults] = useState<MovieResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<MovieResult | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The item id a selected movie will be added under, generated at selection
  // time (not Add-click time) so the background detail fetch — kicked off on
  // selection — has a stable id to patch once it resolves, whether that's
  // before or after Add is clicked.
  const selectedIdRef = useRef<string | null>(null);
  // Ids that were actually added, so a detail fetch for an abandoned
  // selection (user picked another movie, or closed the modal) doesn't PATCH
  // an id the server has never seen.
  const addedIdsRef = useRef<Set<string>>(new Set());

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
    selectedIdRef.current = null;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!q.trim()) { setMovieResults([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      const results = await fetchMovieSearch(q.trim());
      setMovieResults(results);
      setSearchLoading(false);
    }, 300);
  }, []);

  const handleSelectMovie = (result: MovieResult) => {
    setSelectedMovie(result);
    const id = crypto.randomUUID();
    selectedIdRef.current = id;
    // Fetch full details to get genre, rating, director in the background —
    // Add no longer waits on this, so it patches in whenever it resolves.
    setDetailLoading(true);
    fetchMovieDetail(result.imdbId).then((detail) => {
      setDetailLoading((prev) => (selectedIdRef.current === id ? false : prev));
      if (!detail) return;
      setSelectedMovie((prev) =>
        prev?.imdbId === result.imdbId ? detail : prev,
      );
      if (addedIdsRef.current.has(id)) {
        onUpdate(id, {
          meta: encodeMovieMeta({
            year: detail.year ?? "",
            genre: detail.genre ?? "",
            rating: detail.rating ?? "",
            director: detail.director ?? "",
            imdbId: detail.imdbId,
          }),
        });
      }
    });
  };

  const handleReelThumbnail = async (file: File) => {
    try {
      const dataUrl = await compressImage(file, 800, 0.82);
      setReelThumbnail(dataUrl);
    } catch {
      setError("Couldn't process that image.");
    }
  };

  const handleAdd = () => {
    setError(null);

    try {
      let item: MoodboardItem;

      if (tab === "movie") {
        if (!selectedMovie || !selectedIdRef.current) return;
        const meta = encodeMovieMeta({
          year: selectedMovie.year ?? "",
          genre: selectedMovie.genre ?? "",
          rating: selectedMovie.rating ?? "",
          director: selectedMovie.director ?? "",
          imdbId: selectedMovie.imdbId,
        });
        item = {
          id: selectedIdRef.current,
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
        addedIdsRef.current.add(item.id);
        onAdd(item);
        onClose();
        return;
      } else if (tab === "reel") {
        const trimmed = reelUrl.trim();
        if (!trimmed) { setError("Please enter a URL."); return; }
        const url = normalizeUrl(trimmed);
        const username = reelCaption.trim() || extractInstagramUsername(url);
        const id = crypto.randomUUID();
        item = {
          id,
          type: "reel",
          board: "discover",
          url,
          title: username,
          subtitle: "Instagram",
          imageUrl: reelThumbnail || undefined,
          meta: encodeReelMeta({ username, reel_url: url }),
          size: 320,
          addedAt: new Date().toISOString(),
        };
        onAdd(item);
        onClose();
        // Only auto-fetch a thumbnail if the user didn't upload one.
        if (!reelThumbnail) {
          fetchOgMeta(url).then((og) => {
            if (og.image) onUpdate(id, { imageUrl: og.image });
            else onMissingThumbnail();
          });
        }
        return;
      } else {
        // Link
        const trimmed = linkUrl.trim();
        if (!trimmed) { setError("Please enter a URL."); return; }
        const url = normalizeUrl(trimmed);
        const domain = getDomain(url);
        const id = crypto.randomUUID();
        item = {
          id,
          type: "link",
          board: "discover",
          url,
          title: domain,
          subtitle: domain,
          size: 320,
          addedAt: new Date().toISOString(),
        };
        onAdd(item);
        onClose();
        fetchOgMeta(url).then((og) => {
          const patch: ItemPatch = {};
          if (og.title) patch.title = og.title;
          if (og.image) patch.imageUrl = og.image;
          if (Object.keys(patch).length > 0) onUpdate(id, patch);
          if (!og.image) onMissingThumbnail();
        });
        return;
      }
    } catch {
      setError("Something went wrong — please try again.");
    }
  };

  const canAdd =
    (tab === "movie" ? !!selectedMovie :
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
            Add to Discover
          </button>
        </div>
    </ModalShell>
  );
}
