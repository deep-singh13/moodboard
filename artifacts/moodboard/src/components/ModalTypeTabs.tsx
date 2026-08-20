interface ModalTypeTab<T extends string> {
  value: T;
  label: string;
}

interface ModalTypeTabsProps<T extends string> {
  tabs: ReadonlyArray<ModalTypeTab<T>>;
  active: T;
  onChange: (value: T) => void;
}

/** The tab strip atop AddDiscoverModal and AddPlaceModal. The two callers'
 *  onChange does more than set state (each also clears its own error, one
 *  also clears a preview) — that stays their call, passed in whole rather
 *  than this component guessing which other state a tab switch should reset. */
export function ModalTypeTabs<T extends string>({ tabs, active, onChange }: ModalTypeTabsProps<T>) {
  return (
    <div className="modal-type-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          className={`modal-type-tab ${active === tab.value ? "active" : ""}`}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
