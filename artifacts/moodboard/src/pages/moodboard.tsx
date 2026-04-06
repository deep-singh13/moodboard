import { useEffect, useRef, useState, useCallback } from "react";
import { AddItemModal } from "@/components/AddItemModal";
import { MoodboardCard } from "@/components/MoodboardCard";
import { Lightbox } from "@/components/Lightbox";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { MoodboardItem } from "@/types";
import {
  fetchItems,
  createItem,
  deleteItem,
  patchItemComplete,
} from "@/lib/api";

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
  const [items, setItems] = useState<MoodboardItem[]>([]);
  const [layoutItems, setLayoutItems] = useState<MoodboardItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [showHint, setShowHint] = useState(false);
  const [hintFading, setHintFading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const panX = useRef(0);
  const panY = useRef(0);
  const scale = useRef(1);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const velocity = useRef({ x: 0, y: 0 });
  const animFrameRef = useRef<number | null>(null);
  const lastTouches = useRef<TouchList | null>(null);
  const lastPinchDist = useRef<number | null>(null);

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

  useEffect(() => {
    const storedTheme = loadTheme();
    setTheme(storedTheme);
    document.documentElement.setAttribute("data-theme", storedTheme);
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute(
        "content",
        storedTheme === "dark" ? "#111110" : "#F9F8F5",
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

    fetchItems()
      .then((loaded) => setItems(loaded))
      .catch(() => setLoadError(true));
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
          next === "dark" ? "#111110" : "#F9F8F5",
        );
      }
      return next;
    });
  }, []);

  const addItem = useCallback((item: MoodboardItem) => {
    const withSize = { ...item, size: pickSize() };
    setItems((prev) => [...prev, withSize]);
    createItem(withSize).catch(() => {
      setItems((prev) => prev.filter((i) => i.id !== withSize.id));
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    deleteItem(id).catch(() => {
      // Item already removed from UI — nothing to revert cleanly
    });
  }, []);

  const toggleComplete = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.map((i) =>
        i.id === id ? { ...i, completed: !i.completed } : i,
      );
      const updated = next.find((i) => i.id === id);
      if (updated) {
        patchItemComplete(id, updated.completed ?? false).catch(() => {
          // Silent — state already flipped; ideally revert on error
        });
      }
      return next;
    });
  }, []);

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
      } else if (
        e.touches.length === 1 &&
        lastTouches.current.length === 1
      ) {
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
      if (e.key === "Escape" && isModalOpen) setIsModalOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isModalOpen]);

  return (
    <div className="moodboard-root" data-theme={theme}>
      <div className="moodboard-topbar">
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
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>

      <div ref={wrapperRef} className="moodboard-wrapper">
        <div ref={canvasRef} className="moodboard-canvas">
          {loadError ? (
            <div className="empty-state">
              <div className="empty-state-inner">
                <p>Couldn't connect to the server. Please refresh.</p>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-inner">
                <p>Your moodboard is empty — add a link or photo to begin</p>
              </div>
            </div>
          ) : (
            layoutItems.map((item) => (
              <MoodboardCard
                key={item.id}
                item={item}
                onRemove={removeItem}
                onToggleComplete={toggleComplete}
                onPhotoClick={setLightboxSrc}
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

      <button
        className="fab-btn"
        onClick={() => setIsModalOpen(true)}
        aria-label="Add item"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      {isModalOpen && (
        <AddItemModal onClose={() => setIsModalOpen(false)} onAdd={addItem} />
      )}

      {lightboxSrc && (
        <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
}
