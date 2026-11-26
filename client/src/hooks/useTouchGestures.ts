import { RefObject, useEffect, useRef } from 'react';

export interface GestureHandlers {
  onLeft: () => void;
  onRight: () => void;
  onSoftDrop: () => void;
  onHardDrop: () => void;
  onRotate: () => void;
  onHold: () => void;
}

interface GestureOptions {
  enabled: boolean;
  /** Pixels of horizontal drag needed to move one column */
  stepX: number;
  /** Pixels of downward drag needed to move one row */
  stepY: number;
}

/**
 * Mobile touch gestures (PC mouse is ignored so the keyboard stays the PC control):
 * - Tap                  → rotate
 * - Drag left / right    → move piece column by column (follows your finger)
 * - Drag down            → soft drop row by row
 * - Fast flick down      → hard drop
 * - Swipe up             → hold
 */
export function useTouchGestures(
  ref: RefObject<HTMLElement | null>,
  handlers: GestureHandlers,
  { enabled, stepX, stepY }: GestureOptions
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    let st: {
      id: number;
      startX: number;
      startY: number;
      startT: number;
      anchorX: number;
      anchorY: number;
      axis: 'x' | 'y' | null;
      lastY: number;
      lastT: number;
      vy: number;
      holdDone: boolean;
    } | null = null;

    const LOCK_THRESHOLD = 10;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      const target = e.target as HTMLElement;
      if (target.closest('button, a, input, textarea, select')) return;
      if (st) return; // ignore extra fingers
      e.preventDefault();
      const now = performance.now();
      st = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startT: now,
        anchorX: e.clientX,
        anchorY: e.clientY,
        axis: null,
        lastY: e.clientY,
        lastT: now,
        vy: 0,
        holdDone: false,
      };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!st || e.pointerId !== st.id) return;
      e.preventDefault();
      const h = handlersRef.current;
      const now = performance.now();

      const dtv = now - st.lastT;
      if (dtv > 0) {
        const inst = (e.clientY - st.lastY) / dtv;
        st.vy = st.vy * 0.5 + inst * 0.5;
      }
      st.lastY = e.clientY;
      st.lastT = now;

      const dx = e.clientX - st.startX;
      const dy = e.clientY - st.startY;

      if (!st.axis) {
        if (Math.abs(dx) < LOCK_THRESHOLD && Math.abs(dy) < LOCK_THRESHOLD) return;
        st.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }

      // While moving sideways, a clear downward pull switches to soft drop
      if (st.axis === 'x' && e.clientY - st.anchorY > stepY * 2.5) {
        st.axis = 'y';
      }

      if (st.axis === 'x') {
        while (e.clientX - st.anchorX >= stepX) {
          h.onRight();
          st.anchorX += stepX;
        }
        while (st.anchorX - e.clientX >= stepX) {
          h.onLeft();
          st.anchorX -= stepX;
        }
        st.anchorY = Math.min(st.anchorY, e.clientY);
      } else {
        while (e.clientY - st.anchorY >= stepY) {
          h.onSoftDrop();
          st.anchorY += stepY;
        }
        if (!st.holdDone && st.startY - e.clientY > 60 && Math.abs(dx) < 50) {
          st.holdDone = true;
          h.onHold();
        }
      }
    };

    const onUp = (e: PointerEvent) => {
      if (!st || e.pointerId !== st.id) return;
      const h = handlersRef.current;
      const now = performance.now();
      const dt = now - st.startT;
      const dx = e.clientX - st.startX;
      const dy = e.clientY - st.startY;
      const dist = Math.hypot(dx, dy);

      if (!st.axis && dist < LOCK_THRESHOLD + 2 && dt < 350) {
        h.onRotate();
      } else if (
        st.axis === 'y' &&
        dy > 45 &&
        Math.abs(dy) > Math.abs(dx) &&
        (st.vy > 0.9 || (dt < 260 && dy / dt > 0.6))
      ) {
        h.onHardDrop();
      }

      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      st = null;
    };

    const onCancel = (e: PointerEvent) => {
      if (st && e.pointerId === st.id) st = null;
    };

    el.addEventListener('pointerdown', onDown, { passive: false });
    el.addEventListener('pointermove', onMove, { passive: false });
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);

    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
    };
  }, [ref, enabled, stepX, stepY]);
}
