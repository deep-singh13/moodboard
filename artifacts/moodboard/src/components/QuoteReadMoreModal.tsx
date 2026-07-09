import { useRef } from "react";

interface QuoteReadMoreModalProps {
  text: string;
  author?: string;
  onClose: () => void;
}

export function QuoteReadMoreModal({ text, author, onClose }: QuoteReadMoreModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="modal-drawer">
        <div className="modal-handle" />
        <p className="modal-label">Quote</p>

        <p className="modal-quote-text">{text}</p>
        {author && <p className="modal-quote-author">{author}</p>}

        <div className="modal-actions">
          <button type="button" className="modal-btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
