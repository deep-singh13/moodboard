import { useState, useRef, useEffect } from "react";
import { SkeletonCard } from "@/components/MoodboardCard";
import { ModalShell } from "@/components/ModalShell";
import type { MoodboardItem } from "@/types";
import type { ItemPatch } from "@/lib/useBoard";
import { fetchOgMeta } from "@/lib/api";
import { compressImage } from "@/lib/imageUtils";
import { getDomain, normalizeUrl } from "@/lib/urlUtils";

interface AddItemModalProps {
  onClose: () => void;
  onAdd: (item: MoodboardItem) => void;
  onUpdate: (id: string, patch: ItemPatch) => void;
}

function detectType(url: string): MoodboardItem["type"] {
  if (/youtube\.com\/watch|youtu\.be\//.test(url)) return "youtube";
  if (/substack\.com/.test(url)) return "substack";
  return "link";
}

function extractYoutubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

async function fetchYoutubeTitle(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(
      `https://noembed.com/embed?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    const data = await res.json();
    return data.title;
  } catch {
    return undefined;
  }
}

export function AddItemModal({ onClose, onAdd, onUpdate }: AddItemModalProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleAdd = () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    const normalizedUrl = normalizeUrl(trimmed);
    setError(null);

    const type = detectType(normalizedUrl);

    if (type === "youtube") {
      const videoId = extractYoutubeId(normalizedUrl);
      if (!videoId) {
        setError("Couldn't load that link. Check the URL and try again.");
        return;
      }
      const id = crypto.randomUUID();
      const imageUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      onAdd({
        id,
        type: "youtube",
        url: normalizedUrl,
        subtitle: "YouTube",
        imageUrl,
        addedAt: new Date().toISOString(),
      });
      onClose();
      fetchYoutubeTitle(normalizedUrl).then((title) => {
        if (title) onUpdate(id, { title });
      });
      return;
    }

    const domain = getDomain(normalizedUrl);
    const substackName =
      type === "substack" ? domain.replace(".substack.com", "") : domain;
    const id = crypto.randomUUID();
    onAdd({
      id,
      type,
      url: normalizedUrl,
      title: normalizedUrl,
      subtitle: type === "substack" ? substackName : domain,
      addedAt: new Date().toISOString(),
    });
    onClose();
    fetchOgMeta(normalizedUrl).then((meta) => {
      const patch: ItemPatch = {};
      if (meta.title) patch.title = meta.title;
      if (meta.image) patch.imageUrl = meta.image;
      if (Object.keys(patch).length > 0) onUpdate(id, patch);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAdd();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const dataUrl = await compressImage(file, 1200, 0.82);
      const item: MoodboardItem = {
        id: crypto.randomUUID(),
        type: "photo",
        url: dataUrl,
        imageUrl: dataUrl,
        title: file.name.replace(/\.[^.]+$/, ""),
        addedAt: new Date().toISOString(),
      };
      onAdd(item);
      onClose();
    } catch {
      setError("Couldn't process that image. Try a different file.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell onClose={onClose} label="Add to moodboard">
        {loading ? (
          <div style={{ padding: "16px 0" }}>
            <SkeletonCard size={280} />
            <p
              style={{
                textAlign: "center",
                fontSize: 13,
                color: "var(--text-muted)",
                marginTop: 12,
              }}
            >
              Processing…
            </p>
          </div>
        ) : (
          <>
            <input
              ref={inputRef}
              className="modal-input"
              type="url"
              placeholder="Paste a link — Substack, YouTube, or any website"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            {error && <p className="modal-error">{error}</p>}
            <div className="modal-actions">
              <button
                className="modal-btn-secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                Upload Photo
              </button>
              <button
                className="modal-btn-primary"
                onClick={handleAdd}
                disabled={loading || !url.trim()}
              >
                Add
              </button>
            </div>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleFileUpload}
        />
    </ModalShell>
  );
}
