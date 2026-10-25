// Dolly gallery in plain TypeScript, no dependencies.
// Ported from the React component: tiles sit on a line of depth, the "camera" moves along it, tiles scale with
// perspective, fade in ahead and out behind. The camera offset is eased towards a target, and the speed adds a
// little sway, pulse and tilt. Drive the target with setTarget() (e.g. from scroll), or enable `interactive`
// for wheel / drag / keyboard.

export interface DollyOptions {
  itemWidth?: number;
  aspectRatio?: number;
  grayscale?: number;
  perspective?: number;
  spacing?: number;
  spread?: number;
  scatter?: number;
  revealRange?: number;
  passRange?: number;
  parallaxX?: number;
  parallaxY?: number;
  parallaxSmooth?: number;
  tilt?: number;
  pulse?: number;
  drift?: number;
  smooth?: number;
  wheelSpeed?: number;
  dragSpeed?: number;
  autoScroll?: number;
  pauseOnHover?: boolean;
  /** Steps of empty corridor before the first tile (room for a title). */
  lead?: number;
  /** Wheel, drag and arrow keys move the camera. Off when the target is driven from outside. */
  interactive?: boolean;
  /** Extra 0..1 multiplier on every tile's opacity, from the camera offset (e.g. to hold tiles back behind a title). */
  gate?: (offset: number) => number;
  onIndexChange?: (index: number) => void;
  /** Called every painted frame with the current camera offset (px along the corridor). */
  onFrame?: (offset: number) => void;
}

export interface Dolly {
  setTarget(offset: number): void;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  resize(): void;
  destroy(): void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const jitter = (k: number, salt: number) => {
  const x = Math.sin(k * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export function createDolly(root: HTMLElement, tiles: HTMLElement[], options: DollyOptions = {}): Dolly {
  const o = {
    itemWidth: 340,
    aspectRatio: 4 / 5,
    grayscale: 0,
    perspective: 1000,
    spacing: 800,
    spread: 0.8,
    scatter: 0.1,
    revealRange: 1.5,
    passRange: 1,
    parallaxX: 0.12,
    parallaxY: 0.06,
    parallaxSmooth: 0.85,
    tilt: 4,
    pulse: 0.03,
    drift: 0.08,
    smooth: 0.85,
    wheelSpeed: 1,
    dragSpeed: 1.5,
    autoScroll: 0,
    pauseOnHover: true,
    lead: 0,
    interactive: false,
    ...options,
  };

  const step = Math.max(40, o.spacing);
  const min = -o.lead * step;
  const max = Math.max(min, (tiles.length - 1) * step);
  const settle = (v: number) => clamp(v, min, max);

  let width = 0;
  let height = 0;
  let tileWidth = 0;
  let tileHeight = 0;
  let target = min;
  let shown = min;
  let speed = 0;
  let sway = 0;
  let flick = 0;
  let raf = 0;
  let live = false;
  let stamp = 0;
  let hovering = false;
  let visible = true;
  let drag: { y: number; at: number } | null = null;
  let lastIndex = -1;
  const aim = { x: 0, y: 0 };
  const eased = { x: 0, y: 0 };

  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  const layout = () => {
    width = root.clientWidth;
    height = root.clientHeight;
    tileWidth = Math.max(40, Math.min(o.itemWidth, width - 32));
    tileHeight = tileWidth / Math.max(0.1, o.aspectRatio);
    for (const tile of tiles) {
      tile.style.width = `${tileWidth}px`;
      tile.style.height = `${tileHeight}px`;
      tile.style.marginLeft = `${-tileWidth / 2}px`;
      tile.style.marginTop = `${-tileHeight / 2}px`;
      if (o.grayscale > 0) tile.style.filter = `grayscale(${clamp(o.grayscale, 0, 1)})`;
    }
  };

  const paint = (offset: number) => {
    if (!height) return;
    const rush = clamp(Math.abs(speed) / 2500, 0, 1);
    const gate = o.gate ? clamp(o.gate(offset), 0, 1) : 1;
    let nearest = -1;
    let nearestGap = Infinity;
    tiles.forEach((tile, k) => {
      const depth = k * step - offset;
      const t = depth / step;
      const alpha =
        (t >= 0
          ? 1 - clamp(t / Math.max(0.01, o.revealRange), 0, 1)
          : 1 - clamp(-t / Math.max(0.01, o.passRange), 0, 1)) * gate;
      if (alpha <= 0.002 || -depth >= o.perspective * 0.95) {
        tile.style.visibility = 'hidden';
        return;
      }
      tile.style.visibility = 'visible';
      const gap = Math.abs(depth);
      if (gap < nearestGap) {
        nearestGap = gap;
        nearest = k;
      }
      const side = k % 2 === 0 ? -1 : 1;
      const baseX = side * o.spread * (0.7 + 0.3 * jitter(k, 1)) * tileWidth;
      const baseY = (jitter(k, 2) * 2 - 1) * o.scatter * tileHeight;
      const x = baseX + eased.x * o.parallaxX * tileWidth * alpha;
      const y = baseY + eased.y * o.parallaxY * tileHeight * alpha + sway * o.drift * tileHeight;
      const swell = 1 + o.pulse * rush * alpha;
      const rx = -eased.y * o.tilt * rush * alpha;
      const ry = eased.x * o.tilt * rush * alpha;
      tile.style.opacity = alpha.toFixed(3);
      tile.style.setProperty('--a', alpha.toFixed(3));
      // the stage is flattened (overflow hidden), so stack by depth: nearer tiles paint over farther ones
      tile.style.zIndex = String(Math.round(10000 - depth));
      tile.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${(-depth).toFixed(1)}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${swell.toFixed(4)})`;
    });
    if (nearest >= 0 && nearest !== lastIndex) {
      lastIndex = nearest;
      o.onIndexChange?.(nearest);
    }
    o.onFrame?.(offset);
  };

  const wake = () => {
    if (live) return;
    live = true;
    stamp = 0;
    const tick = (now: number) => {
      const reduced = reducedQuery.matches;
      const dt = stamp ? Math.min(0.05, (now - stamp) / 1000) : 1 / 60;
      stamp = now;
      const drifting = o.autoScroll !== 0 && visible && !(o.pauseOnHover && hovering) && !drag;
      if (drifting) target = settle(target + o.autoScroll * dt);
      if (Math.abs(flick) > 1) {
        target = settle(target + flick * dt);
        flick *= Math.pow(0.02, dt);
      } else {
        flick = 0;
      }
      const rate = 1.5 + (1 - clamp(o.smooth, 0, 1)) * 30;
      const ease = reduced ? 1 : 1 - Math.exp(-dt * rate);
      const next = shown + (target - shown) * ease;
      const moved = next - shown;
      shown = next;
      const velocity = reduced ? 0 : moved / dt;
      const blend = 1 - Math.exp(-dt * 8);
      speed += (velocity - speed) * blend;
      sway += (clamp(-velocity / 2500, -1, 1) - sway) * blend * 0.6;
      const pointerRate = 2 + (1 - clamp(o.parallaxSmooth, 0, 1)) * 40;
      const pointerEase = reduced ? 1 : 1 - Math.exp(-dt * pointerRate);
      eased.x += (aim.x - eased.x) * pointerEase;
      eased.y += (aim.y - eased.y) * pointerEase;
      paint(shown);
      const restless =
        Math.abs(target - shown) > 0.05 ||
        Math.abs(speed) > 1 ||
        Math.abs(sway) > 0.001 ||
        Math.abs(aim.x - eased.x) > 0.001 ||
        Math.abs(aim.y - eased.y) > 0.001;
      if (restless || drifting || flick !== 0) {
        raf = requestAnimationFrame(tick);
      } else {
        shown = target;
        speed = 0;
        sway = 0;
        paint(shown);
        live = false;
      }
    };
    raf = requestAnimationFrame(tick);
  };

  const onPointerMove = (e: PointerEvent) => {
    const rect = root.getBoundingClientRect();
    aim.x = clamp(((e.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
    aim.y = clamp(((e.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
    if (drag) {
      const dy = e.clientY - drag.y;
      const now = performance.now();
      const dt = Math.max(1, now - drag.at) / 1000;
      drag.y = e.clientY;
      drag.at = now;
      target = settle(target - dy * o.dragSpeed);
      flick = (-dy * o.dragSpeed) / dt;
    }
    wake();
  };
  const onPointerEnter = () => {
    hovering = true;
  };
  const onPointerLeave = () => {
    hovering = false;
    aim.x = 0;
    aim.y = 0;
    wake();
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    drag = { y: e.clientY, at: performance.now() };
    flick = 0;
    root.setPointerCapture(e.pointerId);
  };
  const onPointerUp = (e: PointerEvent) => {
    if (!drag) return;
    drag = null;
    if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId);
    flick = clamp(flick, -4000, 4000);
    wake();
  };
  const onWheel = (e: WheelEvent) => {
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1;
    const before = target;
    target = settle(before + e.deltaY * unit * o.wheelSpeed);
    if (target === before) return; // at an end: let the page scroll on
    e.preventDefault();
    flick = 0;
    wake();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const jumps: Record<string, number> = {
      ArrowDown: step, ArrowUp: -step, ArrowRight: step, ArrowLeft: -step, PageDown: step, PageUp: -step, ' ': step,
    };
    const jump = jumps[e.key];
    if (jump === undefined) return;
    e.preventDefault();
    target = settle(target + jump);
    wake();
  };

  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerenter', onPointerEnter);
  root.addEventListener('pointerleave', onPointerLeave);
  if (o.interactive) {
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('pointerup', onPointerUp);
    root.addEventListener('pointercancel', onPointerUp);
    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('keydown', onKeyDown);
  }

  const resizeObserver = new ResizeObserver(() => {
    layout();
    paint(shown);
  });
  resizeObserver.observe(root);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
  });
  intersection.observe(root);

  layout();
  paint(shown);

  return {
    setTarget(offset) {
      target = settle(offset);
      wake();
    },
    min,
    max,
    step,
    resize() {
      layout();
      paint(shown);
    },
    destroy() {
      cancelAnimationFrame(raf);
      live = false;
      resizeObserver.disconnect();
      intersection.disconnect();
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerenter', onPointerEnter);
      root.removeEventListener('pointerleave', onPointerLeave);
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('pointerup', onPointerUp);
      root.removeEventListener('pointercancel', onPointerUp);
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('keydown', onKeyDown);
      for (const tile of tiles) tile.removeAttribute('style');
    },
  };
}
