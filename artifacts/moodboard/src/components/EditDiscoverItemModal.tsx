import { useState, useRef } from "react";
import type { MoodboardItem } from "@/types";
import { compressImage } from "@/lib/imageUtils";

interface EditDiscoverItemModalProps {
  item: MoodboardItem;
  onClose: () => void;
  onSave: (updates: { title?: string | null; imageUrl?: string | null }) => void;
}

export function EditDiscoverItemModal({ item, onClose, onSave }: EditDiscoverItemModalProps) {
  const [caption, setCaption] = useState(item.title ?? "");
  // undefined = no change; null = explicitly remove; string = new value
  const [newImageData, setNewImageData] = useState<string | null | undefined>(undefined);
  const [uploadLoading, setUploadLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const previewUrl = newImageData !== undefined ? newImageData ?? undefined : item.imageUrl;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadLoading(true);
    try {
      const dataUrl = await compressImage(file, 1200, 0.82);
      setNewImageData(dataUrl);
    } catch {
      // silently ignore — user can retry
    } finally {
      setUploadLoading(false);
      // reset so the same file can be re-selected
      e.target.value = "";
    }
  };

  const handleSave = () => {
    const updates: { title?: string | null; imageUrl?: string | null } = {};
    const trimmed = caption.trim();
    if (trimmed !== (item.title ?? "")) updates.title = trimmed || null;
    if (newImageData !== undefined) updates.imageUrl = newImageData;
    onSave(updates);
    onClose();
  };

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="modal-drawer">
        <div className="modal-handle" />
        <p className="modal-label">Edit tile</p>

        {/* Thumbnail preview */}
        {previewUrl && (
          <div className="edit-modal-thumb-wrap">
            <img src={previewUrl} alt="thumbnail preview" className="edit-modal-thumb" />
          </div>
        )}

        {/* Caption / title */}
        <input
          className="modal-input"
          placeholder="Caption…"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
          autoFocus
        />

        {/* Thumbnail upload */}
        <button
          className={`modal-upload-btn ${newImageData ? "has-file" : ""}`}
          onClick={() => fileRef.current?.click()}
          disabled={uploadLoading}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
          </svg>
          {uploadLoading ? "Processing…" : newImageData ? "Thumbnail changed ✓" : "Change thumbnail"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn-primary"
            onClick={handleSave}
            disabled={uploadLoading}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
