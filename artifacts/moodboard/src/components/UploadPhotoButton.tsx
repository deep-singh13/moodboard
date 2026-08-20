import { useRef } from "react";

interface UploadPhotoButtonProps {
  /** Whether a file has already been chosen — swaps in the "has-file" style. */
  hasFile: boolean;
  /** Full button text; each caller owns its own microcopy (upload prompt vs
   *  uploaded-confirmation vs a processing state), so this isn't derived here. */
  label: string;
  disabled?: boolean;
  onFileSelect: (file: File) => void;
}

/** A click-to-open hidden file input plus its trigger button — the wiring
 *  (ref, click-through, extracting the File from the change event) was
 *  identical across three callers; only the label text and hasFile source
 *  differ, both of which stay with the caller. */
export function UploadPhotoButton({
  hasFile,
  label,
  disabled,
  onFileSelect,
}: UploadPhotoButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        type="button"
        className={`modal-upload-btn ${hasFile ? "has-file" : ""}`}
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
        </svg>
        {label}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset so the same file can be re-selected — only one of the three
          // original callers did this; the other two would silently no-op on
          // a re-pick of the identical file.
          e.target.value = "";
          if (file) onFileSelect(file);
        }}
      />
    </>
  );
}
