// Smooth scrolling without the browser's scrollbar, as the "Lumen" gallery pages do it.
//  1. scrollGestures() listens to the mouse wheel, finger swipes and the keys (with preventDefault, so the page itself never really scrolls) and
//     reports how many pixels the person asked to move.
//  2. createLerp() keeps a "target" and a "current" value. Every frame current moves a fixed share of the remaining distance towards the
//     target: current += (target - current) * factor. That is what gives the soft, slightly lagging glide.

export interface Lerp {
  setTarget(value: number | ((target: number) => number)): void;
  jump(value: number): void;
  getValue(): number;
  getTarget(): number;
  destroy(): void;
}

export function createLerp({ lerpFactor = 0.1, threshold = 0.01, onUpdate }: { lerpFactor?: number; threshold?: number; onUpdate: (value: number) => void }): Lerp {
  let current = 0;
  let target = 0;
  let frame = 0;

  const tick = () => {
    const diff = target - current;
    if (Math.abs(diff) < threshold) {
      current = target;
      onUpdate(current);
      frame = 0;
      return;
    }
    current += diff * lerpFactor;
    onUpdate(current);
    frame = requestAnimationFrame(tick);
  };

  return {
    setTarget(value) {
      target = typeof value === 'function' ? value(target) : value;
      if (!frame) frame = requestAnimationFrame(tick);
    },
    jump(value) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      current = value;
      target = value;
      onUpdate(value);
    },
    getValue: () => current,
    getTarget: () => target,
    destroy() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

const LINE_HEIGHT = 100 / 6;

interface GestureOptions {
  enabled: () => boolean;
  onDelta: (delta: number) => void;
  shouldHandle?: (delta: number) => boolean;
  touchMultiplier?: number;
  wheelMultiplier?: number;
}

/** Returns destroy(). `enabled()` is asked at each gesture, so it can change over time without re-binding. */
export function scrollGestures({ enabled, onDelta, shouldHandle, touchMultiplier = 2, wheelMultiplier = 1 }: GestureOptions) {
  let lastY = 0;

  const handle = (delta: number, event: Event) => {
    if (!delta || !enabled()) return;
    if (shouldHandle && !shouldHandle(delta)) return;
    event.preventDefault();
    onDelta(delta);
  };
  const onWheel = (e: WheelEvent) => {
    const unit = e.deltaMode === 1 ? LINE_HEIGHT : e.deltaMode === 2 ? window.innerHeight : 1;
    handle(e.deltaY * unit * wheelMultiplier, e);
  };
  const onTouchStart = (e: TouchEvent) => {
    const t = e.targetTouches[0];
    if (t) lastY = t.clientY;
  };
  const onTouchMove = (e: TouchEvent) => {
    const t = e.targetTouches[0];
    if (!t) return;
    const delta = -(t.clientY - lastY) * touchMultiplier;
    lastY = t.clientY;
    handle(delta, e);
  };
  // arrow keys, page keys and space also scroll, for people without a wheel
  const onKey = (e: KeyboardEvent) => {
    const map: Record<string, number> = { ArrowDown: 80, ArrowUp: -80, PageDown: window.innerHeight * 0.8, PageUp: -window.innerHeight * 0.8, ' ': window.innerHeight * 0.8 };
    const delta = map[e.key];
    if (delta) handle(delta, e);
  };

  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('touchstart', onTouchStart, { passive: false });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('keydown', onKey);
  return () => {
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('keydown', onKey);
  };
}
