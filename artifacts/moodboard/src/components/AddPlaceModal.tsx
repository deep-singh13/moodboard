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
import { getDomain, normalizeUrl } from "@/lib/urlUtils";
import { ModalShell } from "@/components/ModalShell";
import { ModalTypeTabs } from "@/components/ModalTypeTabs";
import { UploadPhotoButton } from "@/components/UploadPhotoButton";
import type { ItemPatch } from "@/lib/useBoard";

interface AddPlaceModalProps {
  onClose: () => void;
  onAdd: (item: MoodboardItem) => void;
  onUpdate: (id: string, patch: ItemPatch) => void;
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

/** Patch fields for backfilling a stub place once its full detail arrives —
 *  everything `detailToItem` computes except the identity/type fields the
 *  stub already has. */
function detailToPatch(detail: PlaceDetail): ItemPatch {
  const full = detailToItem(detail);
  return {
    title: full.title,
    subtitle: full.subtitle,
    imageUrl: full.imageUrl,
    meta: full.meta,
  };
}

export function AddPlaceModal({ onClose, onAdd, onUpdate }: AddPlaceModalProps) {
  const [tab, setTab] = useState<TabType>("search");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Search tab
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Link tab
  const [linkUrl, setLinkUrl] = useState("");

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

  /** Picking a result commits it immediately — name/city land now, the rest
   *  (address, photo, rating, cuisines) backfills once the District page has
   *  been fetched. Failure is silent, same as a failed OG-meta fetch
   *  elsewhere in this app: the stub just keeps its minimal fields. */
  const handleSelectPlace = (result: PlaceSearchResult) => {
    const id = crypto.randomUUID();
    const meta: PlaceMeta = {
      mapsUrl: buildMapsUrl({}, result.label),
      cuisines: [],
      photos: [],
      menuImages: [],
      source: "district",
    };
    onAdd({
      id,
      type: "place",
      board: "places",
      url: result.url,
      title: result.label,
      subtitle: result.city.toUpperCase(),
      meta: encodePlaceMeta(meta),
      size: 320,
      addedAt: new Date().toISOString(),
    });
    onClose();
    fetchPlaceDetail(result.url).then((detail) => {
      if (detail) onUpdate(id, detailToPatch(detail));
    });
  };

  const handleAddFromLink = () => {
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
    setError(null);

    const id = crypto.randomUUID();
    onAdd({
      id,
      type: "place",
      board: "places",
      url,
      title: getDomain(url),
      meta: encodePlaceMeta({ cuisines: [], photos: [], menuImages: [], source: "district" }),
      size: 320,
      addedAt: new Date().toISOString(),
    });
    onClose();
    fetchPlaceDetail(url).then((detail) => {
      if (detail) onUpdate(id, detailToPatch(detail));
    });
  };

  const handleManualPhoto = async (file: File) => {
    try {
      setManualPhoto(await compressImage(file, 800, 0.82));
    } catch {
      setError("Couldn't process that image.");
    }
  };

  const handleAddManual = () => {
    const name = manualName.trim();
    if (!name) { setError("Please enter a name."); return; }
    setError(null);
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
  };

  return (
    <ModalShell onClose={onClose} label="Add a place">
        <ModalTypeTabs
          tabs={TABS}
          active={tab}
          onChange={(t) => {
            setTab(t);
            setError(null);
          }}
        />

        {/* Search by name — picking a row adds it immediately */}
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
                    className="movie-result"
                    onClick={() => handleSelectPlace(r)}
                  >
                    <div>
                      <div className="movie-result-title">{r.label}</div>
                      <div className="movie-result-meta">{r.city.toUpperCase()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Paste a District link — "Add place" commits, detail backfills after */}
        {tab === "link" && (
          <>
            <input
              ref={inputRef}
              className="modal-input"
              type="url"
              placeholder="Paste a district.in restaurant link…"
              value={linkUrl}
              onChange={(e) => { setLinkUrl(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddFromLink(); }}
            />
            {error && <p className="modal-error">{error}</p>}
            <div className="modal-actions">
              <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
              <button
                className="modal-btn-primary"
                onClick={handleAddFromLink}
                disabled={!linkUrl.trim()}
              >
                Add place
              </button>
            </div>
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
            {error && <p className="modal-error">{error}</p>}
            <div className="modal-actions">
              <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
              <button
                className="modal-btn-primary"
                onClick={handleAddManual}
                disabled={!manualName.trim()}
              >
                Add place
              </button>
            </div>
          </>
        )}
    </ModalShell>
  );
}
