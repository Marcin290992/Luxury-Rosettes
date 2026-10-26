// Dolly gallery in plain TypeScript, no dependencies.
// Ported from the React component: tiles sit on a line of depth, the "camera" moves along it, tiles scale with
// perspective, fade in ahead and out behind. The camera offset is eased towards a target, and the speed adds a
// little sway, pulse and tilt. Drive the target with setTarget() (e.g. from scroll), or enable `interactive`
// for wheel / drag / keyboard.

import { clamp } from './math';

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
  /** 0..1: share of passRange during which a tile that has passed the camera stays fully opaque before it fades (0 = fades at once). */
  passHold?: number;
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
  /** Steps of corridor kept after the last tile (room for a finale). */
  tail?: number;
  /** Steps over which a full-screen tile (data-full) fades in as the camera approaches it. */
  fullReveal?: number;
  /** Extra steps of empty corridor between the last ordinary tile and a full-screen tile. */
  fullGap?: number;
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

// Fixed feel of the engine (what is tunable per use is in DollyOptions)
const MIN_STEP = 40; // px: the smallest allowed distance between tiles
const MIN_TILE = 40; // px: the smallest a tile may get
const SIDE_MARGIN = 32; // px kept free beside a tile
const MIN_ASPECT = 0.1;
const MIN_RANGE = 0.01; // divisor guard for the reveal / pass ranges
const Z_BASE = 10000; // nearer tiles paint over farther ones
const HIDDEN_ALPHA = 0.002; // below this a tile is not painted
const NEAR_CLIP = 0.95; // share of the perspective distance after which a tile has gone through the camera
const RUSH_SPEED = 2500; // px/s at which the speed effects (pulse, tilt, sway) are at full strength
const MAX_FLICK = 4000; // px/s: the fastest a released drag keeps gliding
const FLICK_DECAY = 0.02; // share of the flick left after one second
const MAX_FRAME = 0.05; // s: longest frame the motion is integrated over
const SPEED_BLEND = 8; // how fast the measured speed follows the real one
const SWAY_BLEND = 0.6; // share of that speed the sway follows at
const EASE_BASE = 1.5; // camera easing rate: base ...
const EASE_RANGE = 30; // ... plus this much at smooth = 0
const POINTER_BASE = 2; // pointer parallax easing rate: base ...
const POINTER_RANGE = 40; // ... plus this much at parallaxSmooth = 0
const LINE_PX = 16; // px of one wheel "line"
const SETTLED = { target: 0.05, speed: 1, sway: 0.001, pointer: 0.001, flick: 1 }; // when the loop may go to sleep

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
    passHold: 0,
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
    tail: 0,
    fullReveal: 1.6,
    fullGap: 0,
    interactive: false,
    ...options,
  };

  const step = Math.max(MIN_STEP, o.spacing);
  const min = -o.lead * step;
  const max = Math.max(min, (tiles.length - 1 + o.tail) * step);
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
    tileWidth = Math.max(MIN_TILE, Math.min(o.itemWidth, width - SIDE_MARGIN));
    tileHeight = tileWidth / Math.max(MIN_ASPECT, o.aspectRatio);
    for (const tile of tiles) {
      // a full tile (data-full) is the size of the stage: it fills the screen when the camera reaches it
      const w = 'full' in tile.dataset ? width : tileWidth;
      const h = 'full' in tile.dataset ? height : tileHeight;
      tile.style.width = `${w}px`;
      tile.style.height = `${h}px`;
      tile.style.marginLeft = `${-w / 2}px`;
      tile.style.marginTop = `${-h / 2}px`;
      if (o.grayscale > 0) tile.style.filter = `grayscale(${clamp(o.grayscale, 0, 1)})`;
    }
  };

  const paint = (offset: number) => {
    if (!height) return;
    const rush = clamp(Math.abs(speed) / RUSH_SPEED, 0, 1);
    const gate = o.gate ? clamp(o.gate(offset), 0, 1) : 1;
    let nearest = -1;
    let nearestGap = Infinity;
    tiles.forEach((tile, k) => {
      const full = 'full' in tile.dataset;
      const raw = (full ? k + o.fullGap : k) * step - offset;
      const depth = full ? Math.max(0, raw) : raw; // a full tile stops at the camera and holds
      const t = depth / step;
      const alpha =
        (t >= 0
          ? 1 - clamp(t / Math.max(MIN_RANGE, full ? o.fullReveal : o.revealRange), 0, 1)
          : 1 - clamp((-t / Math.max(MIN_RANGE, o.passRange) - o.passHold) / Math.max(MIN_RANGE, 1 - o.passHold), 0, 1)) * gate;
      if (alpha <= HIDDEN_ALPHA || -depth >= o.perspective * NEAR_CLIP) {
        tile.style.visibility = 'hidden';
        return;
      }
      tile.style.visibility = 'visible';
      const gap = Math.abs(depth);
      if (gap < nearestGap) {
        nearestGap = gap;
        nearest = k;
      }
      if (full) {
        tile.style.opacity = alpha.toFixed(3);
        tile.style.setProperty('--a', alpha.toFixed(3));
        tile.style.zIndex = String(Math.round(Z_BASE - depth));
        tile.style.transform = `translate3d(0, 0, ${(-depth).toFixed(1)}px)`;
        return;
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
      tile.style.zIndex = String(Math.round(Z_BASE - depth));
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
      const dt = stamp ? Math.min(MAX_FRAME, (now - stamp) / 1000) : 1 / 60;
      stamp = now;
      const drifting = o.autoScroll !== 0 && visible && !(o.pauseOnHover && hovering) && !drag;
      if (drifting) target = settle(target + o.autoScroll * dt);
      if (Math.abs(flick) > SETTLED.flick) {
        target = settle(target + flick * dt);
        flick *= Math.pow(FLICK_DECAY, dt);
      } else {
        flick = 0;
      }
      const rate = EASE_BASE + (1 - clamp(o.smooth, 0, 1)) * EASE_RANGE;
      const ease = reduced ? 1 : 1 - Math.exp(-dt * rate);
      const next = shown + (target - shown) * ease;
      const moved = next - shown;
      shown = next;
      const velocity = reduced ? 0 : moved / dt;
      const blend = 1 - Math.exp(-dt * SPEED_BLEND);
      speed += (velocity - speed) * blend;
      sway += (clamp(-velocity / RUSH_SPEED, -1, 1) - sway) * blend * SWAY_BLEND;
      const pointerRate = POINTER_BASE + (1 - clamp(o.parallaxSmooth, 0, 1)) * POINTER_RANGE;
      const pointerEase = reduced ? 1 : 1 - Math.exp(-dt * pointerRate);
      eased.x += (aim.x - eased.x) * pointerEase;
      eased.y += (aim.y - eased.y) * pointerEase;
      paint(shown);
      const restless =
        Math.abs(target - shown) > SETTLED.target ||
        Math.abs(speed) > SETTLED.speed ||
        Math.abs(sway) > SETTLED.sway ||
        Math.abs(aim.x - eased.x) > SETTLED.pointer ||
        Math.abs(aim.y - eased.y) > SETTLED.pointer;
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
    flick = clamp(flick, -MAX_FLICK, MAX_FLICK);
    wake();
  };
  const onWheel = (e: WheelEvent) => {
    const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? height : 1;
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
