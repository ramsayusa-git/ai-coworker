"use client";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

// Drag-to-resize a panel's width, persisted per-browser so it stays put across visits.
// `edge: "right"` means dragging the panel's right border resizes it (sidebar); "left" means
// dragging the left border does (a panel docked on the right side of the screen).
export function useResizableWidth(key: string, opts: { min: number; max: number; default: number; edge: "left" | "right" }) {
  const [width, setWidth] = useState(opts.default);
  const dragging = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) setWidth(Math.min(opts.max, Math.max(opts.min, Number(saved))));
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!dragging.current) return;
    const delta = e.clientX - dragging.current.startX;
    const signed = opts.edge === "right" ? delta : -delta;
    const next = Math.min(opts.max, Math.max(opts.min, dragging.current.startWidth + signed));
    setWidth(next);
  }, [opts.min, opts.max, opts.edge]);

  const onPointerUp = useCallback((e: PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = null;
    setWidth((w) => {
      try { localStorage.setItem(key, String(w)); } catch { /* ignore */ }
      return w;
    });
    (e.target as Element)?.releasePointerCapture?.(e.pointerId);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }, [key, onPointerMove]);

  const startDrag = useCallback((e: ReactPointerEvent) => {
    dragging.current = { startX: e.clientX, startWidth: width };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }, [width, onPointerMove, onPointerUp]);

  return { width, startDrag };
}
