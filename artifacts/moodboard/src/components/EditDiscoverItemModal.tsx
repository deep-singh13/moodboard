import { useState } from "react";
import type { MoodboardItem } from "@/types";
import { compressImage } from "@/lib/imageUtils";
import { ModalShell } from "@/components/ModalShell";
import { UploadPhotoButton } from "@/components/UploadPhotoButton";

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

  const previewUrl = newImageData !== undefined ? newImageData ?? undefined : item.imageUrl;

  const handleFileChange = async (file: File) => {
    setUploadLoading(true);
    try {
      const dataUrl = await compressImage(file, 1200, 0.82);
      setNewImageData(dataUrl);
    } catch {
      // silently ignore — user can retry
    } finally {
      setUploadLoading(false);
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
    <ModalShell onClose={onClose} label="Edit tile">
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

        <UploadPhotoButton
          hasFile={!!newImageData}
          label={uploadLoading ? "Processing…" : newImageData ? "Thumbnail changed ✓" : "Change thumbnail"}
          disabled={uploadLoading}
          onFileSelect={handleFileChange}
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
    </ModalShell>
  );
}
