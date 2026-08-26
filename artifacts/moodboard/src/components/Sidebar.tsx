import { useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BoardIcon, DiscoverIcon, QuoteIcon, MapPinIcon } from "@/components/icons";
import { useMinWidth } from "@/lib/gridUtils";

export type TabId = "board" | "discover" | "quotes" | "places";

interface SidebarTabDef {
  id: TabId;
  label: string;
  Icon: (props: { size?: number }) => React.JSX.Element;
}

// Must match --sidebar-width's expanded value in index.css. The nav's own
// `width` normally tracks that CSS var (set at the .moodboard-root level
// from the persisted collapse preference, so board content only reflows on
// a real pin/unpin) — peeking overrides it inline instead, so the rail
// widens locally without touching the var or the layout underneath it.
const EXPANDED_SIDEBAR_WIDTH = "220px";

const SIDEBAR_TABS: ReadonlyArray<SidebarTabDef> = [
  { id: "board", label: "Board", Icon: BoardIcon },
  { id: "discover", label: "Discover", Icon: DiscoverIcon },
  { id: "quotes", label: "Quotes", Icon: QuoteIcon },
  { id: "places", label: "Places", Icon: MapPinIcon },
];

interface SidebarProps {
  activeTab: TabId;
  onSelectTab: (id: TabId) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onOpenSearch: () => void;
}

export function Sidebar({
  activeTab,
  onSelectTab,
  collapsed,
  onToggleCollapsed,
  theme,
  onToggleTheme,
  onOpenSearch,
}: SidebarProps) {
  const [hovered, setHovered] = useState(false);
  // Hovering the collapsed rail on a desktop-width viewport peeks it open
  // without touching the persisted preference — tablet/mobile never set
  // `hovered` to anything meaningful since isDesktop stays false there.
  const isDesktop = useMinWidth(1024);
  const peeking = collapsed && isDesktop && hovered;
  const visuallyCollapsed = collapsed && !peeking;

  return (
    <nav
      className={`sidebar ${visuallyCollapsed ? "is-collapsed" : ""}`}
      aria-label="Sections"
      style={peeking ? { width: EXPANDED_SIDEBAR_WIDTH } : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="sidebar-header">
        <span className="sidebar-wordmark">moodboard</span>
      </div>

      <ul className="sidebar-tabs">
        {SIDEBAR_TABS.map(({ id, label, Icon }) => {
          const isActive = id === activeTab;
          return (
            <li key={id}>
              <button
                type="button"
                className={`sidebar-tab ${isActive ? "is-active" : ""}`}
                aria-current={isActive ? "true" : undefined}
                onClick={() => onSelectTab(id)}
                title={visuallyCollapsed ? label : undefined}
              >
                <Icon size={17} />
                <span className="sidebar-tab-label">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-search-btn"
          onClick={onOpenSearch}
          aria-label="Open search"
          title={visuallyCollapsed ? "Search" : undefined}
        >
          <svg
            className="sidebar-search-icon"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <span className="sidebar-search-label">Search…</span>
          <kbd className="sidebar-search-kbd">⌘K</kbd>
        </button>

        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>

      <button
        type="button"
        className="sidebar-collapse-btn"
        onClick={onToggleCollapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: collapsed ? "rotate(180deg)" : undefined }}
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
    </nav>
  );
}

export default Sidebar;
