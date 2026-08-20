import { useRef, type ReactNode } from "react";

interface ModalShellProps {
  onClose: () => void;
  /** The title line under the handle. Omit it for a modal with its own custom
   *  header (PlaceDetailModal) — everything else renders the plain
   *  `modal-label` all seven modals used to write by hand. */
  label?: string;
  /** An extra class on the drawer, for a modal that needs its own layout
   *  (PlaceDetailModal's wider `place-detail`). */
  className?: string;
  children: ReactNode;
}

/** The overlay/drawer/handle wrapper every modal in this app uses: a
 *  full-screen click-catcher that closes on a click landing on the overlay
 *  itself (not on the drawer), and a drawer with a drag handle. Each modal
 *  still owns its own focus-on-mount — three genuinely different variants
 *  (focus once on mount, native `autoFocus`, re-focus when a tab changes)
 *  don't collapse into one shared behavior without losing one of them. */
export function ModalShell({ onClose, label, className, children }: ModalShellProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className={`modal-drawer${className ? ` ${className}` : ""}`}>
        <div className="modal-handle" />
        {label && <p className="modal-label">{label}</p>}
        {children}
      </div>
    </div>
  );
}
