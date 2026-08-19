import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { AddItemModal } from "@/components/AddItemModal";
import { MoodboardCard } from "@/components/MoodboardCard";
import { Lightbox } from "@/components/Lightbox";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { MoodboardItem } from "@/types";
import { refreshAllPrices } from "@/lib/api";
import { useBoard } from "@/lib/useBoard";
import Discover from "@/pages/discover";
import Quotes from "@/pages/quotes";
import Places from "@/pages/places";
import { SpotlightSearch } from "@/components/SpotlightSearch";
import { MorphicTabs, type MorphicTabItem } from "@/components/MorphicTabs";
import { LightRays } from "@/components/LightRays";

type TabId = "board" | "discover" | "quotes" | "places";

const TABS: ReadonlyArray<MorphicTabItem<TabId>> = [
  { id: "board", label: "Board" },
  { id: "discover", label: "Discover" },
  { id: "quotes", label: "Quotes" },
  { id: "places", label: "Places" },
];

const GRID_GAP = 20;
const COLS_SIZES = [220, 320, 420];
const SIZE_WEIGHTS = [1, 3, 1];

function pickSize(): number {
  const total = SIZE_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < SIZE_WEIGHTS.length; i++) {
    r -= SIZE_WEIGHTS[i];
    if (r <= 0) return COLS_SIZES[i];
  }
  return COLS_SIZES[1];
}

function computeLayout(items: MoodboardItem[]): MoodboardItem[] {
  if (items.length === 0) return [];

  const placed: Array<{ x: number; y: number; w: number; h: number; id: string }> = [];

  const occupies = (x: number, y: number, w: number, h: number): boolean => {
    for (const p of placed) {
      if (
        x < p.x + p.w + GRID_GAP &&
        x + w + GRID_GAP > p.x &&
        y < p.y + p.h + GRID_GAP &&
        y + h + GRID_GAP > p.y
      ) {
        return true;
      }
    }
    return false;
  };

  const result = items.map((item, i) => {
    const w = item.size ?? pickSize();
    const h = item.type === "photo" ? w : w * 0.75 + 80;

    let bestX = 0;
    let bestY = 0;
    let found = false;

    if (i === 0) {
      bestX = -w / 2;
      bestY = -h / 2;
      found = true;
    } else {
      const candidates: Array<{ x: number; y: number; dist: number }> = [];

      for (const p of placed) {
        const positions = [
          { x: p.x + p.w + GRID_GAP, y: p.y },
          { x: p.x - w - GRID_GAP, y: p.y },
          { x: p.x, y: p.y + p.h + GRID_GAP },
          { x: p.x, y: p.y - h - GRID_GAP },
          { x: p.x + p.w + GRID_GAP, y: p.y + p.h + GRID_GAP },
          { x: p.x - w - GRID_GAP, y: p.y - h - GRID_GAP },
          { x: p.x + p.w + GRID_GAP, y: p.y - h - GRID_GAP },
          { x: p.x - w - GRID_GAP, y: p.y + p.h + GRID_GAP },
        ];
        for (const pos of positions) {
          const cx = pos.x + w / 2;
          const cy = pos.y + h / 2;
          const dist = Math.sqrt(cx * cx + cy * cy);
          candidates.push({ ...pos, dist });
        }
      }

      candidates.sort((a, b) => a.dist - b.dist);

      for (const cand of candidates) {
        if (!occupies(cand.x, cand.y, w, h)) {
          bestX = cand.x;
          bestY = cand.y;
          found = true;
          break;
        }
      }

      if (!found) {
        const angle = (i * 137.5 * Math.PI) / 180;
        const radius = 100 + i * 60;
        bestX = Math.cos(angle) * radius - w / 2;
        bestY = Math.sin(angle) * radius - h / 2;
      }
    }

    placed.push({ x: bestX, y: bestY, w, h, id: item.id });
    return { ...item, size: w, gridX: bestX, gridY: bestY };
  });

  return result;
}

function loadTheme(): "light" | "dark" {
  try {
    const t = localStorage.getItem("moodboard-theme");
    if (t === "dark" || t === "light") return t;
  } catch {}
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function Moodboard() {
  // The board packs its cards spatially, so a new item appends rather than
  // prepending — prepending would reshuffle every existing card's position.
  const {
    items,
    loading,
    loadError,
    addError,
    add,
    remove,
    toggleComplete,
    updateNote,
  } = useBoard({ board: "moodboard", insert: "append" });

  const [layoutItems, setLayoutItems] = useState<MoodboardItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [showHint, setShowHint] = useState(false);
  const [hintFading, setHintFading] = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [surpriseId, setSurpriseId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("board");

  const canvasRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const topbarRef = useRef<HTMLDivElement>(null);
  const surpriseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const panX = useRef(0);
  const panY = useRef(0);
  const scale = useRef(1);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const velocity = useRef({ x: 0, y: 0 });
  const animFrameRef = useRef<number | null>(null);
  const lastTouches = useRef<TouchList | null>(null);
  const lastPinchDist = useRef<number | null>(null);

  // The topbar is fixed and floats over the pages, so the pages have to pad
  // themselves clear of it. Its height isn't a constant: below 640px it wraps,
  // and how many rows it takes depends on both the viewport width and which
  // tab is active (Board carries extra controls). Publishing the measured
  // bottom edge lets the CSS pad by exactly the right amount instead of
  // hardcoding a number that is wrong at most widths.
  useLayoutEffect(() => {
    const el = topbarRef.current;
    if (!el) return;

    const publish = () => {
      const { bottom } = el.getBoundingClientRect();
      document.documentElement.style.setProperty(
        "--topbar-bottom",
        `${Math.round(bottom)}px`,
      );
    };

    publish();
    // Catches wrapping and per-tab content changes; the resize listener covers
    // the `top` offset, which shifts at the 640px breakpoint without the
    // element's own size necessarily changing.
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    window.addEventListener("resize", publish);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", publish);
    };
  }, []);

  const applyTransform = useCallback(() => {
    if (canvasRef.current) {
      canvasRef.current.style.transform = `translate(${panX.current}px, ${panY.current}px) scale(${scale.current})`;
    }
  }, []);

  const resetView = useCallback(() => {
    panX.current = 0;
    panY.current = 0;
    scale.current = 1;
    applyTransform();
  }, [applyTransform]);

  const scrollToItem = useCallback(
    (item: MoodboardItem) => {
      const w = item.size ?? 320;
      const h = item.type === "photo" ? w : w * 0.75 + 80;
      const targetPanX = -((item.gridX ?? 0) + w / 2) * scale.current;
      const targetPanY = -((item.gridY ?? 0) + h / 2) * scale.current;

      const startPanX = panX.current;
      const startPanY = panY.current;
      const startTime = performance.now();
      const duration = 600;

      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

      const animate = (time: number) => {
        const progress = Math.min((time - startTime) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        panX.current = startPanX + (targetPanX - startPanX) * ease;
        panY.current = startPanY + (targetPanY - startPanY) * ease;
        applyTransform();
        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(animate);
        }
      };

      animFrameRef.current = requestAnimationFrame(animate);
    },
    [applyTransform],
  );

  const selectBoardItem = useCallback(
    (item: MoodboardItem) => {
      setSpotlightOpen(false);
      if (surpriseTimerRef.current) clearTimeout(surpriseTimerRef.current);
      setSurpriseId(item.id);
      scrollToItem(item);
      surpriseTimerRef.current = setTimeout(() => setSurpriseId(null), 2000);
    },
    [scrollToItem],
  );

  useEffect(() => {
    const storedTheme = loadTheme();
    setTheme(storedTheme);
    document.documentElement.setAttribute("data-theme", storedTheme);
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute(
        "content",
        storedTheme === "dark" ? "#0D0D0C" : "#F7F6F2",
      );
    }

    const isMobile = window.innerWidth < 768;
    const isFirstLoad = !localStorage.getItem("moodboard-hint-shown");
    if (isMobile && isFirstLoad) {
      setShowHint(true);
      localStorage.setItem("moodboard-hint-shown", "1");
      setTimeout(() => setHintFading(true), 2500);
      setTimeout(() => setShowHint(false), 3000);
    }
  }, []);

  // Product prices/availability go stale while the app is closed (and this
  // runs on a Render free-tier backend that sleeps after 15min idle anyway),
  // so warm them every time the app loads rather than waiting for a manual
  // refresh on the Discover tab.
  useEffect(() => {
    refreshAllPrices().catch(() => {});
  }, []);

  useEffect(() => {
    setLayoutItems(computeLayout(items));
  }, [items]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      localStorage.setItem("moodboard-theme", next);
      document.documentElement.setAttribute("data-theme", next);
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute(
          "content",
          next === "dark" ? "#0D0D0C" : "#F7F6F2",
        );
      }
      return next;
    });
  }, []);

  // Card size is drawn here rather than in the board module: it only means
  // anything to the spatial packer, and it has to be stamped before the
  // optimistic insert so the card doesn't resize once the save lands.
  const addItem = useCallback(
    (item: MoodboardItem) => {
      add({ ...item, size: pickSize() });
    },
    [add],
  );

  const handleSurpriseMe = useCallback(() => {
    const pool = layoutItems.filter((item) => !item.completed);
    if (pool.length === 0) return;

    if (surpriseTimerRef.current) clearTimeout(surpriseTimerRef.current);

    let candidates = pool;
    if (pool.length > 1 && surpriseId) {
      candidates = pool.filter((i) => i.id !== surpriseId);
    }
    const picked = candidates[Math.floor(Math.random() * candidates.length)];

    setSurpriseId(picked.id);
    scrollToItem(picked);

    surpriseTimerRef.current = setTimeout(() => setSurpriseId(null), 4000);
  }, [layoutItems, surpriseId, scrollToItem]);

  const inertia = useCallback(() => {
    if (Math.abs(velocity.current.x) < 0.1 && Math.abs(velocity.current.y) < 0.1) {
      velocity.current = { x: 0, y: 0 };
      return;
    }
    velocity.current.x *= 0.92;
    velocity.current.y *= 0.92;
    panX.current += velocity.current.x;
    panY.current += velocity.current.y;
    applyTransform();
    animFrameRef.current = requestAnimationFrame(inertia);
  }, [applyTransform]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const onMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest(".moodboard-card")) return;
      isDragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      velocity.current = { x: 0, y: 0 };
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      wrapper.style.cursor = "grabbing";
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      velocity.current = { x: dx, y: dy };
      panX.current += dx;
      panY.current += dy;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      applyTransform();
    };

    const onMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      wrapper.style.cursor = "grab";
      animFrameRef.current = requestAnimationFrame(inertia);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const delta = -e.deltaY * 0.005;
        const newScale = Math.max(0.2, Math.min(3, scale.current + delta));
        const rect = wrapper.getBoundingClientRect();
        const mouseX = e.clientX - rect.left - rect.width / 2;
        const mouseY = e.clientY - rect.top - rect.height / 2;
        const scaleRatio = newScale / scale.current;
        panX.current = mouseX + (panX.current - mouseX) * scaleRatio;
        panY.current = mouseY + (panY.current - mouseY) * scaleRatio;
        scale.current = newScale;
      } else {
        velocity.current = { x: 0, y: 0 };
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        panX.current -= e.deltaX;
        panY.current -= e.deltaY;
      }
      applyTransform();
    };

    const onTouchStart = (e: TouchEvent) => {
      lastTouches.current = e.touches;
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastPinchDist.current = Math.sqrt(dx * dx + dy * dy);
      } else if (e.touches.length === 1) {
        velocity.current = { x: 0, y: 0 };
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (!lastTouches.current) return;

      if (e.touches.length === 2 && lastPinchDist.current !== null) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const delta = (dist - lastPinchDist.current) * 0.005;
        const newScale = Math.max(0.2, Math.min(3, scale.current + delta));
        scale.current = newScale;
        lastPinchDist.current = dist;
      } else if (e.touches.length === 1 && lastTouches.current.length === 1) {
        const dx = e.touches[0].clientX - lastTouches.current[0].clientX;
        const dy = e.touches[0].clientY - lastTouches.current[0].clientY;
        velocity.current = { x: dx, y: dy };
        panX.current += dx;
        panY.current += dy;
      }

      lastTouches.current = e.touches;
      applyTransform();
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        lastPinchDist.current = null;
        animFrameRef.current = requestAnimationFrame(inertia);
      }
      lastTouches.current = e.touches;
    };

    wrapper.style.cursor = "grab";
    wrapper.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    wrapper.addEventListener("wheel", onWheel, { passive: false });
    wrapper.addEventListener("touchstart", onTouchStart, { passive: false });
    wrapper.addEventListener("touchmove", onTouchMove, { passive: false });
    wrapper.addEventListener("touchend", onTouchEnd);

    return () => {
      wrapper.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      wrapper.removeEventListener("wheel", onWheel);
      wrapper.removeEventListener("touchstart", onTouchStart);
      wrapper.removeEventListener("touchmove", onTouchMove);
      wrapper.removeEventListener("touchend", onTouchEnd);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [applyTransform, inertia]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSpotlightOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && isModalOpen) {
        setIsModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isModalOpen]);

  // Clear surprise highlight when user clicks surprise id tile or after timer
  useEffect(() => {
    return () => {
      if (surpriseTimerRef.current) clearTimeout(surpriseTimerRef.current);
    };
  }, []);

  const displayedItems = layoutItems;

  return (
    <div className="moodboard-root" data-theme={theme}>
      {/* Ambient background for every tab — mounted once here rather than per
          page, so the rays keep their phase when you switch tabs instead of
          restarting the animation each time. */}
      <LightRays />

      <div className="moodboard-topbar" ref={topbarRef}>
        <span className="topbar-wordmark">moodboard</span>
        <div className="topbar-divider" aria-hidden="true" />

        {/* Tab switcher */}
        <MorphicTabs<TabId>
          items={TABS}
          activeId={activeTab}
          onSelect={setActiveTab}
          label="Sections"
        />

        {/* Board-only controls */}
        {activeTab === "board" && (
          <>
            <button className="reset-btn" onClick={resetView} title="Reset view">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Reset view
            </button>
            <span className="item-count">
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>
          </>
        )}

        {/* Search — shared trigger; opens Spotlight modal */}
        <button
          className="search-trigger"
          onClick={() => setSpotlightOpen(true)}
          aria-label="Open search"
        >
          <svg
            className="search-icon"
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <span className="search-trigger-label">Search…</span>
          <kbd className="search-trigger-kbd">⌘K</kbd>
        </button>

        {/* Board-only: Surprise Me */}
        {activeTab === "board" && (
          <button
            className="surprise-btn"
            onClick={handleSurpriseMe}
            disabled={items.length === 0}
            title="Highlight a random tile"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            <span className="surprise-btn-label">Surprise me</span>
          </button>
        )}

        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>

      {/* Board canvas — stays mounted to preserve pan/zoom state */}
      <div
        className="board-layer"
        style={{ display: activeTab === "board" ? undefined : "none" }}
      >
        <div ref={wrapperRef} className="moodboard-wrapper">
          <div ref={canvasRef} className="moodboard-canvas">
            {loading ? (
              <div className="empty-state">
                <div className="empty-state-inner canvas-loading">
                  <span className="loading-dot" />
                  <span className="loading-dot" />
                  <span className="loading-dot" />
                </div>
              </div>
            ) : loadError ? (
              <div className="empty-state">
                <div className="empty-state-inner">
                  <p>Couldn't connect to the server. Please refresh.</p>
                </div>
              </div>
            ) : items.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-inner">
                  <span className="empty-state-headline">Start collecting</span>
                  <p>Add a link or photo to begin building your board</p>
                </div>
              </div>
            ) : (
              displayedItems.map((item) => (
                <MoodboardCard
                  key={item.id}
                  item={item}
                  onRemove={remove}
                  onToggleComplete={toggleComplete}
                  onPhotoClick={setLightboxSrc}
                  isHighlighted={item.id === surpriseId}
                  onUpdateNote={updateNote}
                />
              ))
            )}
          </div>
        </div>

        {showHint && (
          <div className={`drag-hint ${hintFading ? "fading" : ""}`}>
            Drag to explore
          </div>
        )}

        {/* Board FAB */}
        <button
          className="fab-btn"
          onClick={() => setIsModalOpen(true)}
          aria-label="Add item"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="fab-label">Add</span>
        </button>
      </div>

      {/* Discover page — manages its own FAB and modal */}
      {activeTab === "discover" && (
        <Discover
          spotlightOpen={spotlightOpen}
          onSpotlightClose={() => setSpotlightOpen(false)}
        />
      )}

      {/* Quotes page — manages its own FAB and modal */}
      {activeTab === "quotes" && (
        <Quotes
          spotlightOpen={spotlightOpen}
          onSpotlightClose={() => setSpotlightOpen(false)}
        />
      )}

      {/* Places page — manages its own FAB and modals */}
      {activeTab === "places" && (
        <Places
          spotlightOpen={spotlightOpen}
          onSpotlightClose={() => setSpotlightOpen(false)}
        />
      )}

      {/* Board spotlight */}
      <SpotlightSearch
        open={spotlightOpen && activeTab === "board"}
        onClose={() => setSpotlightOpen(false)}
        items={layoutItems}
        onSelect={selectBoardItem}
        placeholder="Search the board…"
      />

      {isModalOpen && (
        <AddItemModal onClose={() => setIsModalOpen(false)} onAdd={addItem} />
      )}

      {lightboxSrc && (
        <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}

      {addError && (
        <div className="error-toast" role="alert">
          {addError}
        </div>
      )}
    </div>
  );
}
