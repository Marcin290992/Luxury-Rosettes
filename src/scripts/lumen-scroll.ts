// Smooth scrolling without the browser's scrollbar, as the "Lumen" gallery pages do it.
//  1. scrollGestures() listens to the mouse wheel, finger swipes and the keys (with preventDefault, so the page itself never really scrolls) and
//     reports how many pixels the person asked to move.
//  2. createLerp() keeps a "target" and a "current" value. Every frame current moves a fixed share of the remaining distance towards the
//     target: current += (target - current) * factor. That is what gives the soft, slightly lagging glide.

export interface Lerp {
  setTarget(value: number | ((target: number) => number), kind?: 'wheel' | 'touch'): void;
  jump(value: number): void;
  getValue(): number;
  getTarget(): number;
  destroy(): void;
}

// glide: the way the rest of the site scrolls (Lenis): every wheel turn glides from where the page is to the new target over `glide` seconds, on an
// exponential ease-out; a finger follows with `lerpFactor` (Lenis' syncTouchLerp). Without `glide` everything follows with the lerp.
const lenisEase = (t: number) => Math.min(1, 1.001 - 2 ** (-10 * t));

export function createLerp({ lerpFactor = 0.1, threshold = 0.01, glide = 0, onUpdate }: { lerpFactor?: number; threshold?: number; glide?: number; onUpdate: (value: number) => void }): Lerp {
  let current = 0;
  let target = 0;
  let frame = 0;

  let gliding = false;
  let from = 0;
  let startedAt = 0;

  const tick = () => {
    if (gliding) {
      const t = Math.min(1, (performance.now() - startedAt) / (glide * 1000));
      current = t >= 1 ? target : from + (target - from) * lenisEase(t);
      onUpdate(current);
      if (t >= 1) {
        gliding = false;
        frame = 0;
      } else frame = requestAnimationFrame(tick);
      return;
    }
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
    setTarget(value, kind = 'touch') {
      target = typeof value === 'function' ? value(target) : value;
      gliding = glide > 0 && kind === 'wheel';
      if (gliding) {
        from = current;
        startedAt = performance.now();
      }
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
  onDelta: (delta: number, kind: 'wheel' | 'touch') => void;
  shouldHandle?: (delta: number) => boolean;
  touchMultiplier?: number;
  wheelMultiplier?: number;
  touchInertia?: number; // how much of the finger's speed is carried on after it lifts (1 = as fast as the finger; 0 = the page stops dead)
}

/** Returns destroy(). `enabled()` is asked at each gesture, so it can change over time without re-binding. */
export function scrollGestures({ enabled, onDelta, shouldHandle, touchMultiplier = 2, wheelMultiplier = 1, touchInertia = 0 }: GestureOptions) {
  let lastY = 0;

  const handle = (delta: number, event: Event, kind: 'wheel' | 'touch' = 'touch') => {
    if (!delta || !enabled()) return;
    if (shouldHandle && !shouldHandle(delta)) return;
    event.preventDefault();
    onDelta(delta, kind);
  };
  const onWheel = (e: WheelEvent) => {
    const unit = e.deltaMode === 1 ? LINE_HEIGHT : e.deltaMode === 2 ? window.innerHeight : 1;
    handle(e.deltaY * unit * wheelMultiplier, e, 'wheel');
  };
  // a flick: like Lenis' syncTouch, the page keeps going for a moment after the finger leaves, in proportion to how fast the finger was moving
  let velocity = 0; // px per ms, smoothed
  let lastT = 0;
  let lastMoveAt = 0;
  const onTouchStart = (e: TouchEvent) => {
    const t = e.targetTouches[0];
    stopMomentum();
    if (t) lastY = t.clientY;
    velocity = 0;
    lastMoveAt = 0;
  };
  const onTouchMove = (e: TouchEvent) => {
    const t = e.targetTouches[0];
    if (!t) return;
    const delta = -(t.clientY - lastY) * touchMultiplier;
    lastY = t.clientY;
    const now = performance.now();
    if (lastMoveAt && now > lastT) velocity = velocity * 0.6 + (delta / (now - lastT)) * 0.4;
    lastT = now;
    lastMoveAt = now;
    handle(delta, e);
  };
  // after the finger lifts the page keeps moving at the finger's speed and slows down smoothly (a little each frame), in small steps: one big push at the
  // lift made the page jump ahead at once, which felt like a snap
  let momentum = 0;
  const stopMomentum = () => {
    if (momentum) cancelAnimationFrame(momentum);
    momentum = 0;
  };
  const onTouchEnd = () => {
    const fresh = lastMoveAt && performance.now() - lastMoveAt < 80; // a finger that rested before lifting does not flick
    let v = velocity * touchInertia; // px per ms
    velocity = 0;
    lastMoveAt = 0;
    if (!fresh || Math.abs(v) < 0.15) return;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(now - last, 50);
      last = now;
      v *= 0.95 ** (dt / 16.7);
      if (Math.abs(v) < 0.03 || !enabled()) {
        momentum = 0;
        return;
      }
      if (!shouldHandle || shouldHandle(v * dt)) onDelta(v * dt, 'touch');
      momentum = requestAnimationFrame(step);
    };
    momentum = requestAnimationFrame(step);
  };
  // arrow keys, page keys and space also scroll, for people without a wheel
  const onKey = (e: KeyboardEvent) => {
    const map: Record<string, number> = { ArrowDown: 80, ArrowUp: -80, PageDown: window.innerHeight * 0.8, PageUp: -window.innerHeight * 0.8, ' ': window.innerHeight * 0.8 };
    const delta = map[e.key];
    if (delta) handle(delta, e, 'wheel');
  };

  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('touchstart', onTouchStart, { passive: false });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd);
  window.addEventListener('keydown', onKey);
  return () => {
    stopMomentum();
    window.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('keydown', onKey);
  };
}
