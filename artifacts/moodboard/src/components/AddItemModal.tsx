import { useState, useRef, useEffect } from "react";
import { SkeletonCard } from "@/components/MoodboardCard";
import type { MoodboardItem } from "@/types";

interface AddItemModalProps {
  onClose: () => void;
  onAdd: (item: MoodboardItem) => void;
}

function detectType(url: string): MoodboardItem["type"] {
  if (/youtube\.com\/watch|youtu\.be\//.test(url)) return "youtube";
  if (/substack\.com/.test(url)) return "substack";
  return "link";
}

function extractYoutubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function fetchOgMeta(url: string): Promise<{ title?: string; description?: string; image?: string }> {
  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);
    const data = await res.json();
    const html: string = data.contents ?? "";
    const getOg = (prop: string): string | undefined => {
      const m = html.match(new RegExp(`<meta[^>]*property=["']og:${prop}["'][^>]*content=["']([^"']+)["']`, "i"))
        ?? html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:${prop}["']`, "i"));
      return m ? m[1] : undefined;
    };
    const titleFallback = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    return {
      title: getOg("title") ?? titleFallback,
      description: getOg("description"),
      image: getOg("image"),
    };
  } catch {
    return {};
  }
}

async function fetchYoutubeMeta(url: string, videoId: string): Promise<{ title?: string; imageUrl: string }> {
  const imageUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  try {
    const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    return { title: data.title, imageUrl };
  } catch {
    return { imageUrl };
  }
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

export function AddItemModal({ onClose, onAdd }: AddItemModalProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  const handleAdd = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    let normalizedUrl = trimmed;
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = "https://" + normalizedUrl;
    }

    setLoading(true);
    setError(null);

    try {
      const type = detectType(normalizedUrl);
      let item: MoodboardItem;

      if (type === "youtube") {
        const videoId = extractYoutubeId(normalizedUrl);
        if (!videoId) throw new Error("Invalid YouTube URL");
        const meta = await fetchYoutubeMeta(normalizedUrl, videoId);
        item = {
          id: crypto.randomUUID(),
          type: "youtube",
          url: normalizedUrl,
          title: meta.title,
          subtitle: "YouTube",
          imageUrl: meta.imageUrl,
          addedAt: new Date().toISOString(),
        };
      } else {
        const meta = await fetchOgMeta(normalizedUrl);
        item = {
          id: crypto.randomUUID(),
          type,
          url: normalizedUrl,
          title: meta.title,
          subtitle: type === "substack"
            ? (getDomain(normalizedUrl))
            : getDomain(normalizedUrl),
          imageUrl: meta.image,
          addedAt: new Date().toISOString(),
        };
      }

      onAdd(item);
      onClose();
    } catch (err) {
      setError("Couldn't fetch that link. Please try another URL.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAdd();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const item: MoodboardItem = {
        id: crypto.randomUUID(),
        type: "photo",
        url: dataUrl,
        imageUrl: dataUrl,
        title: file.name,
        addedAt: new Date().toISOString(),
      };
      onAdd(item);
      onClose();
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="modal-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="modal-drawer">
        <div className="modal-handle" />
        <p className="modal-label">Add to moodboard</p>

        {loading ? (
          <div style={{ padding: "16px 0" }}>
            <SkeletonCard size={280} />
          </div>
        ) : (
          <>
            <input
              ref={inputRef}
              className="modal-input"
              type="url"
              placeholder="Paste a link — Substack, YouTube, or any website"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            {error && <p className="modal-error">{error}</p>}
            <div className="modal-actions">
              <button
                className="modal-btn-secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
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
      </div>
    </div>
  );
}
