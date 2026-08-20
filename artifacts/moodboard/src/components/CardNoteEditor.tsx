import { useEffect, useRef, useState } from "react";
import { PencilIcon } from "@/components/icons";

interface CardNoteEditorProps {
  note: string | undefined;
  /** Owned by the card, not this component: the card's own click handler
   *  needs to know whether the editor is open so it can suppress opening the
   *  item while the textarea has focus (the overlay doesn't always cover the
   *  whole card). */
  isEditing: boolean;
  onEditingChange: (isEditing: boolean) => void;
  onSave: (note: string | null) => void;
  placeholder?: string;
}

const NOTE_CHAR_LIMIT = 300;
const BLUR_CLOSE_DELAY_MS = 150;

/** The note-dot indicator, its edit trigger, and the inline editor —
 *  identical across the three card types that have notes, down to the
 *  150ms blur delay (long enough for the Save button's own click to land
 *  before the textarea's blur would otherwise close the editor first). */
export function CardNoteEditor({
  note,
  isEditing,
  onEditingChange,
  onSave,
  placeholder = "Add a personal note…",
}: CardNoteEditorProps) {
  const [draftNote, setDraftNote] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasNote = !!note?.trim();

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [isEditing]);

  const openEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraftNote(note ?? "");
    onEditingChange(true);
  };

  const save = () => {
    onSave(draftNote.trim() || null);
    onEditingChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onEditingChange(false);
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    }
  };

  return (
    <>
      {hasNote && !isEditing && <span className="note-dot" />}
      <button className="card-note" onClick={openEdit} aria-label="Edit note" title="Edit note">
        <PencilIcon />
      </button>
      {isEditing && (
        <div className="note-edit-area" onClick={(e) => e.stopPropagation()}>
          <textarea
            ref={textareaRef}
            className="note-textarea"
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value.slice(0, NOTE_CHAR_LIMIT))}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => onEditingChange(false), BLUR_CLOSE_DELAY_MS)}
            placeholder={placeholder}
            rows={3}
          />
          <div className="note-edit-footer">
            <span className="note-char-count">
              {draftNote.length}/{NOTE_CHAR_LIMIT}
            </span>
            <button
              className="note-save-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={save}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </>
  );
}
