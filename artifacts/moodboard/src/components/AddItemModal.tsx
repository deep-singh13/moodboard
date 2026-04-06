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

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

// Robust OG tag extractor — handles both attribute orders and single/double quotes
function parseOgTags(html: string): { title?: string; description?: string; image?: string } {
  const getOg = (prop: string): string | undefined => {
    // Try property="og:X" content="..." and content="..." property="og:X"
    const patterns = [
      new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, "i"),
      // Also try name= variants
      new RegExp(`<meta[^>]+name=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, "i"),
      // Twitter card fallback for image
      ...(prop === "image" ? [
        new RegExp(`<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']`, "i"),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']`, "i"),
      ] : []),
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m) return m[1];
    }
    return undefined;
  };

  const titleFallback = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  return {
    title: getOg("title") ?? titleFallback,
    description: getOg("description"),
    image: getOg("image"),
  };
}

// Try multiple CORS proxies in sequence
async function fetchWithProxies(url: string): Promise<string> {
  const proxies = [
    async () => {
      const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },
    async () => {
      const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, {
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      if (!data.contents) throw new Error("No contents");
      return data.contents as string;
    },
    async () => {
      const res = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },
  ];

  let lastErr: unknown;
  for (const proxy of proxies) {
    try {
      const html = await proxy();
      // Sanity check — if we got a challenge page or very short response, try next
      if (html && html.length > 500) return html;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("All proxies failed");
}

async function fetchOgMeta(url: string): Promise<{ title?: string; description?: string; image?: string }> {
  try {
    const html = await fetchWithProxies(url);
    return parseOgTags(html);
  } catch {
    // Graceful fallback — return what we can from the URL itself
    return {};
  }
}

async function fetchYoutubeMeta(url: string, videoId: string): Promise<{ title?: string; imageUrl: string }> {
  const imageUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  try {
    const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    return { title: data.title, imageUrl };
  } catch {
    return { imageUrl };
  }
}

// Compress an image file to a smaller data URL using canvas
function compressImage(file: File, maxWidth = 1200, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement("canvas");
      let w = img.width;
      let h = img.height;
      if (w > maxWidth) {
        h = Math.round((h * maxWidth) / w);
        w = maxWidth;
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No canvas context"));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Image load failed"));
    };
    img.src = objectUrl;
  });
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
        const domain = getDomain(normalizedUrl);
        // For Substack, try to extract a clean publication name from the domain
        const substackName = type === "substack"
          ? domain.replace(".substack.com", "")
          : domain;
        item = {
          id: crypto.randomUUID(),
          type,
          url: normalizedUrl,
          title: meta.title ?? normalizedUrl,
          subtitle: type === "substack" ? substackName : domain,
          imageUrl: meta.image,
          addedAt: new Date().toISOString(),
        };
      }

      onAdd(item);
      onClose();
    } catch {
      setError("Couldn't load that link. Check the URL and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAdd();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      // Compress before storing to avoid localStorage quota issues
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
    <div className="modal-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="modal-drawer">
        <div className="modal-handle" />
        <p className="modal-label">Add to moodboard</p>

        {loading ? (
          <div style={{ padding: "16px 0" }}>
            <SkeletonCard size={280} />
            <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-muted)", marginTop: 12 }}>
              Fetching…
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
