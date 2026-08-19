import { useState, useRef, useEffect, useCallback } from "react";
import type {
  MoodboardItem,
  PlaceDetail,
  PlaceMeta,
  PlaceSearchResult,
} from "@/types";
import { fetchPlaceSearch, fetchPlaceDetail } from "@/lib/api";
import { buildMapsUrl } from "@/lib/gridUtils";
import { compressImage } from "@/lib/imageUtils";
import { encodePlaceMeta } from "@/lib/itemMeta";

interface AddPlaceModalProps {
  onClose: () => void;
  onAdd: (item: MoodboardItem) => void;
}

type TabType = "search" | "link" | "manual";

/** Both District paths converge here, so a place saved by link and the same
 *  place saved by name produce an identical row. */
function detailToItem(detail: PlaceDetail): MoodboardItem {
  const meta: PlaceMeta = {
    address: detail.address,
    locality: detail.locality,
    lat: detail.lat,
    lng: detail.lng,
    mapsUrl: buildMapsUrl(detail, detail.name),
    cuisines: detail.cuisines,
    priceForTwo: detail.priceForTwo,
    rating: detail.rating,
    ratingCount: detail.ratingCount,
    phone: detail.phone,
    hours: detail.hours,
    photos: detail.photos,
    menuImages: detail.menuImages,
    source: "district",
  };

  return {
    id: crypto.randomUUID(),
    type: "place",
    board: "places",
    url: detail.districtUrl,
    title: detail.name,
    subtitle: [detail.locality, detail.cuisines.slice(0, 2).join(", ")]
      .filter(Boolean)
      .join(" · "),
    imageUrl: detail.coverImage,
    meta: encodePlaceMeta(meta),
    size: 320,
    addedAt: new Date().toISOString(),
  };
}

export function AddPlaceModal({ onClose, onAdd }: AddPlaceModalProps) {
  const [tab, setTab] = useState<TabType>("search");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Search tab
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Link tab
  const [linkUrl, setLinkUrl] = useState("");

  // Shared preview — whichever District path produced it
  const [preview, setPreview] = useState<PlaceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Manual tab
  const [manualName, setManualName] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [manualCuisine, setManualCuisine] = useState("");
  const [manualPhoto, setManualPhoto] = useState<string | null>(null);
  const manualFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, [tab]);

  useEffect(() => () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
  }, []);

  const handleQueryChange = useCallback((q: string) => {
    setQuery(q);
    setPreview(null);
    setError(null);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (q.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      const found = await fetchPlaceSearch(q.trim());
      setResults(found);
      setSearched(true);
      setSearchLoading(false);
    }, 300);
  }, []);

  const loadDetail = useCallback(async (url: string) => {
    setDetailLoading(true);
    setError(null);
    const detail = await fetchPlaceDetail(url);
    setDetailLoading(false);
    if (!detail) {
      setPreview(null);
      setError("Couldn't read that District page. Try again, or add it manually.");
      return;
    }
    setPreview(detail);
  }, []);

  const handleLinkLookup = useCallback(async () => {
    let url = linkUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;

    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      setError("That doesn't look like a valid link.");
      return;
    }
    if (!/(^|\.)district\.in$/i.test(host)) {
      setError("That's not a District link. Use the By name tab to find it instead.");
      return;
    }
    await loadDetail(url);
  }, [linkUrl, loadDetail]);

  const handleManualPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setManualPhoto(await compressImage(file, 800, 0.82));
    } catch {
      setError("Couldn't process that image.");
    }
  };

  const handleAdd = async () => {
    setError(null);
    setLoading(true);
    try {
      if (tab === "manual") {
        const name = manualName.trim();
        if (!name) { setError("Please enter a name."); return; }
        const address = manualAddress.trim();
        const cuisines = manualCuisine
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
        const meta: PlaceMeta = {
          address: address || undefined,
          cuisines,
          mapsUrl: buildMapsUrl({ address: address || undefined }, name),
          photos: [],
          menuImages: [],
          source: "manual",
        };
        onAdd({
          id: crypto.randomUUID(),
          type: "place",
          board: "places",
          url: "",
          title: name,
          subtitle: [address, cuisines.slice(0, 2).join(", ")]
            .filter(Boolean)
            .join(" · "),
          imageUrl: manualPhoto ?? undefined,
          meta: encodePlaceMeta(meta),
          size: 320,
          addedAt: new Date().toISOString(),
        });
        onClose();
        return;
      }

      if (!preview) return;
      onAdd(detailToItem(preview));
      onClose();
    } catch {
      setError("Something went wrong — please try again.");
    } finally {
      setLoading(false);
    }
  };

  const canAdd =
    !loading &&
    !detailLoading &&
    (tab === "manual" ? !!manualName.trim() : !!preview);

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="modal-drawer">
        <div className="modal-handle" />
        <p className="modal-label">Add a place</p>

        <div className="modal-type-tabs">
          {(["search", "link", "manual"] as TabType[]).map((t) => (
            <button
              key={t}
              className={`modal-type-tab ${tab === t ? "active" : ""}`}
              onClick={() => {
                setTab(t);
                setError(null);
                setPreview(null);
              }}
            >
              {t === "search" ? "🔍 By name" : t === "link" ? "🔗 District link" : "✎ Manual"}
            </button>
          ))}
        </div>

        {/* Search by name */}
        {tab === "search" && (
          <>
            <input
              ref={inputRef}
              className="modal-input"
              placeholder="Search cafés and restaurants…"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
            />
            {searchLoading && <p className="modal-hint">Searching…</p>}
            {!searchLoading && searched && results.length === 0 && (
              <p className="movie-no-results">
                Nothing found. Try fewer words, or add it on the Manual tab.
              </p>
            )}
            {results.length > 0 && (
              <div className="movie-results">
                {results.map((r) => (
                  <div
                    key={r.slug}
                    className={`movie-result ${preview?.districtUrl === r.url ? "selected" : ""}`}
                    onClick={() => loadDetail(r.url)}
                  >
                    <div>
                      <div className="movie-result-title">{r.label}</div>
                      <div className="movie-result-meta">
                        {detailLoading && preview?.districtUrl !== r.url
                          ? "Loading details…"
                          : r.city.toUpperCase()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Paste a District link */}
        {tab === "link" && (
          <>
            <input
              ref={inputRef}
              className="modal-input"
              type="url"
              placeholder="Paste a district.in restaurant link…"
              value={linkUrl}
              onChange={(e) => { setLinkUrl(e.target.value); setPreview(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleLinkLookup(); }}
            />
            <button
              className="modal-upload-btn"
              onClick={handleLinkLookup}
              disabled={!linkUrl.trim() || detailLoading}
            >
              {detailLoading ? "Fetching…" : "Fetch details"}
            </button>
          </>
        )}

        {/* Manual entry */}
        {tab === "manual" && (
          <>
            <input
              ref={inputRef}
              className="modal-input"
              placeholder="Name"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
            />
            <input
              className="modal-input"
              placeholder="Address (optional)"
              value={manualAddress}
              onChange={(e) => setManualAddress(e.target.value)}
            />
            <input
              className="modal-input"
              placeholder="Cuisines, comma separated (optional)"
              value={manualCuisine}
              onChange={(e) => setManualCuisine(e.target.value)}
            />
            <button
              className={`modal-upload-btn ${manualPhoto ? "has-file" : ""}`}
              onClick={() => manualFileRef.current?.click()}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
              {manualPhoto ? "Photo uploaded ✓" : "Upload a photo (optional)"}
            </button>
            <input
              ref={manualFileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleManualPhoto}
            />
          </>
        )}

        {/* Preview of whatever District returned */}
        {detailLoading && tab !== "manual" && (
          <p className="modal-hint">Fetching location, menu and photos…</p>
        )}
        {preview && !detailLoading && (
          <div className="place-preview">
            {preview.coverImage && (
              <img className="place-preview-img" src={preview.coverImage} alt="" />
            )}
            <div className="place-preview-body">
              <p className="place-preview-title">{preview.name}</p>
              <p className="place-preview-meta">
                {[preview.locality, preview.cuisines.slice(0, 2).join(", ")]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="place-preview-counts tnum">
                {preview.lat != null ? "📍 Location" : "No location"}
                {" · "}
                {preview.menuImages.length} menu
                {" · "}
                {preview.photos.length} photos
              </p>
            </div>
          </div>
        )}

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleAdd} disabled={!canAdd}>
            {loading ? "Adding…" : "Add place"}
          </button>
        </div>
      </div>
    </div>
  );
}
