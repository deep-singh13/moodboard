import { useMemo, type CSSProperties } from "react";
import clsx from "clsx";

// ─────────────────────────────────────────────────────────────────────────────
// Ported from Magic UI's Light Rays. The geometry and motion are theirs; the
// implementation is rewritten because the original is ~entirely Tailwind
// utilities and this app emits no Tailwind (index.css has no Tailwind entry).
//
// Animation is CSS keyframes rather than the `motion` package, for three
// reasons: the dependency isn't installed (this app has framer-motion, not its
// successor `motion`), a compositor-driven CSS animation is cheaper for
// something that runs on every page forever, and — the real reason — the
// global prefers-reduced-motion block already clamps CSS animation. A
// JS-driven animation would run straight past it.
//
// This component only produces the ray geometry; everything visual lives in
// the LIGHT RAYS block of index.css, keyed off the per-ray custom properties.
// ─────────────────────────────────────────────────────────────────────────────

interface LightRaysProps {
  /** Number of animated rays. */
  count?: number;
  /** Average seconds per cycle. Higher is slower. */
  speed?: number;
  className?: string;
}

interface Ray {
  id: number;
  left: number;
  width: number;
  rotate: number;
  swing: number;
  delay: number;
  duration: number;
  intensity: number;
}

function createRays(count: number, cycle: number): Ray[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    left: 8 + Math.random() * 84,
    width: 160 + Math.random() * 160,
    rotate: -28 + Math.random() * 56,
    swing: 0.8 + Math.random() * 1.8,
    // Negative, unlike the original's positive delay. A positive delay means
    // the first seconds after load have rays still faded out; starting each one
    // partway through its cycle means the effect is fully present immediately.
    delay: -Math.random() * cycle,
    duration: cycle * (0.75 + Math.random() * 0.5),
    // Capped at 1 — the original can generate up to 1.1, which just clamps.
    intensity: Math.min(0.6 + Math.random() * 0.5, 1),
  }));
}

export function LightRays({ count = 5, speed = 16, className }: LightRaysProps) {
  // The original randomises in useEffect to dodge an SSR hydration mismatch.
  // This is a client-only Vite app, so useMemo is enough — and it avoids the
  // empty first paint that approach causes.
  const rays = useMemo(
    () => createRays(count, Math.max(speed, 0.1)),
    [count, speed],
  );

  return (
    <div className={clsx("light-rays", className)} aria-hidden="true">
      {rays.map((ray) => (
        <span
          key={ray.id}
          className="light-rays-ray"
          style={
            {
              "--ray-left": `${ray.left}%`,
              "--ray-width": `${ray.width}px`,
              "--ray-rotate": `${ray.rotate}deg`,
              "--ray-swing": `${ray.swing}deg`,
              "--ray-delay": `${ray.delay}s`,
              "--ray-duration": `${ray.duration}s`,
              "--ray-intensity": ray.intensity,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

export default LightRays;
