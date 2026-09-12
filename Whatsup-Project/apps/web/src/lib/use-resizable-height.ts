"use client";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

// Drag-to-resize a panel's height, persisted per-browser. `edge: "top"` means dragging the
// panel's top border resizes it (a panel docked at the bottom growing upward).
export function useResizableHeight(key: string, opts: { min: number; max: number; default: number; edge: "top" | "bottom" }) {
  const [height, setHeight] = useState(opts.default);
  const dragging = useRef<{ startY: number; startHeight: number } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) setHeight(Math.min(opts.max, Math.max(opts.min, Number(saved))));
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!dragging.current) return;
    const delta = e.clientY - dragging.current.startY;
    const signed = opts.edge === "top" ? -delta : delta;
    const next = Math.min(opts.max, Math.max(opts.min, dragging.current.startHeight + signed));
    setHeight(next);
  }, [opts.min, opts.max, opts.edge]);

  const onPointerUp = useCallback((e: PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = null;
    setHeight((h) => {
      try { localStorage.setItem(key, String(h)); } catch { /* ignore */ }
      return h;
    });
    (e.target as Element)?.releasePointerCapture?.(e.pointerId);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }, [key, onPointerMove]);

  const startDrag = useCallback((e: ReactPointerEvent) => {
    dragging.current = { startY: e.clientY, startHeight: height };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }, [height, onPointerMove, onPointerUp]);

  return { height, startDrag };
}
