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
import { normalizeUrl } from "@/lib/urlUtils";
import { ModalShell } from "@/components/ModalShell";
import { ModalTypeTabs } from "@/components/ModalTypeTabs";
import { UploadPhotoButton } from "@/components/UploadPhotoButton";

interface AddPlaceModalProps {
  onClose: () => void;
  onAdd: (item: MoodboardItem) => void;
}

type TabType = "search" | "link" | "manual";

const TABS: Array<{ value: TabType; label: string }> = [
  { value: "search", label: "🔍 By name" },
  { value: "link", label: "🔗 District link" },
  { value: "manual", label: "✎ Manual" },
];

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
    const trimmed = linkUrl.trim();
    if (!trimmed) return;
    const url = normalizeUrl(trimmed);

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

  const handleManualPhoto = async (file: File) => {
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
    <ModalShell onClose={onClose} label="Add a place">
        <ModalTypeTabs
          tabs={TABS}
          active={tab}
          onChange={(t) => {
            setTab(t);
            setError(null);
            setPreview(null);
          }}
        />

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
            <UploadPhotoButton
              hasFile={!!manualPhoto}
              label={manualPhoto ? "Photo uploaded ✓" : "Upload a photo (optional)"}
              onFileSelect={handleManualPhoto}
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
    </ModalShell>
  );
}
