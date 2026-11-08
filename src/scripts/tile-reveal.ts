// Tile reveal: photo tiles fly into a grid, the grid zooms past the camera, the tiles step aside and the headline with its
// text is left on the empty stage.
//
// Adapted from React Bits' TileReveal to Vanilla TS for this site (see docs/SCRIPTING.md, section 3):
//  - no React: initTileReveal(root, options) is `init` and returns destroy(),
//  - the scroll is read by ScrollTrigger (so it agrees with Lenis and the other pins); a tiny tween smooths it,
//  - everything is looked up inside `root`; every trigger and observer is released in destroy().
//
// Expected markup (see TileReveal.astro): root > .tr-stage (sticky) > .tr-content (> .tr-headline, .tr-reveal) + .tr-frame > .tr-grid > .tr-tile.

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export interface TileRevealOptions {
  columns: number;
  gap: number;
  tileAspect: number;
  direction: 'alternate' | 'top' | 'bottom';
  stagger: number;
  overlap: number;
  zoom: number;
  spread: number;
  smooth: number;
  contentGap: number;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const inOut = (t: number, power: number) => (t < 0.5 ? Math.pow(2, power - 1) * Math.pow(t, power) : 1 - Math.pow(-2 * t + 2, power) / 2);

export function initTileReveal(root: HTMLElement, o: TileRevealOptions) {
  const stage = root.querySelector<HTMLElement>('.tr-stage')!;
  const grid = root.querySelector<HTMLElement>('.tr-grid')!;
  const tiles = Array.from(root.querySelectorAll<HTMLElement>('.tr-tile'));
  const headline = root.querySelector<HTMLElement>('.tr-headline');
  const reveal = root.querySelector<HTMLElement>('.tr-reveal');

  const cols = Math.max(1, Math.round(o.columns));
  const count = tiles.length;

  // the plan: when each tile flies, and where the zoom, the parting and the text sit on the timeline
  const mid = (cols - 1) / 2;
  const lengths = Array.from({ length: cols }, (_, c) => Math.floor((count - c + cols - 1) / cols));
  const longest = Math.max(0, ...lengths);
  const flyEnd = longest > 0 ? 1 + (longest - 1) * o.stagger : 0;
  const zoomStart = Math.max(0, flyEnd - o.overlap);
  const splitStart = zoomStart + 0.5;
  // the headline comes in once the tiles have mostly parted, the text and buttons follow it
  const headStart = zoomStart + 0.8;
  const contentStart = headStart + 0.3;
  const total = Math.max(zoomStart + 1, contentStart + 0.3, 0.001);
  const rows = Math.ceil(count / cols);
  const plan = tiles.map((_, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const len = lengths[c];
    const fromTop = o.direction === 'top' ? true : o.direction === 'bottom' ? false : c % 2 === 0;
    const centred = Math.abs(c - mid) < 0.001;
    return {
      start: (fromTop ? len - 1 - r : r) * o.stagger,
      dir: fromTop ? -1 : 1,
      col: c,
      row: r,
      lateral: centred ? 0 : Math.sign(c - mid),
      vertical: centred ? (r < Math.floor(len / 2) ? -1 : 1) : 0,
    };
  });

  let stageW = 0;
  let stageH = 0;
  let gridW = 0;
  let gridH = 0;

  const paint = (progress: number) => {
    const u = progress * total;
    const flyDistance = (stageH + gridH) / 2;
    const z = inOut(clamp(u - zoomStart, 0, 1), 3);
    const s = inOut(clamp((u - splitStart) / 0.5, 0, 1), 1);
    const showHead = inOut(clamp((u - headStart) / 0.3, 0, 1), 2);
    const show = inOut(clamp((u - contentStart) / 0.3, 0, 1), 2);
    const scale = Math.max(o.zoom, 1);
    grid.style.transform = `scale(${1 + (scale - 1) * z})`;

    const tileW = Math.max(1, (gridW - o.gap * (cols - 1)) / cols);
    const tileH = tileW / Math.max(o.tileAspect, 0.01);
    const pitchX = tileW + o.gap;
    const pitchY = tileH + o.gap;
    const rowMid = (rows - 1) / 2;
    // how far a tile has to travel to be fully off the (zoomed) stage
    const clearX = (offset: number) => Math.max(o.spread * tileW, stageW / (2 * scale) + tileW / 2 - Math.abs(offset) + o.gap);
    const clearY = (offset: number) => Math.max(o.spread * tileH, stageH / (2 * scale) + tileH / 2 - Math.abs(offset) + o.gap);

    tiles.forEach((node, i) => {
      const t = plan[i];
      const fly = inOut(clamp(u - t.start, 0, 1), 1);
      const flyY = t.dir * flyDistance * (1 - fly);
      const pushX = t.lateral * clearX((t.col - mid) * pitchX) * z;
      const pushY = t.vertical * clearY((t.row - rowMid) * pitchY) * s;
      node.style.transform = `translate3d(${pushX.toFixed(2)}px, ${(flyY + pushY).toFixed(2)}px, 0)`;
      node.style.visibility = fly <= 0 ? 'hidden' : 'visible';
    });

    if (headline) {
      // the headline waits until the photos have parted; it stays in its place (the group is centred) and only rises a little
      headline.style.opacity = showHead.toFixed(3);
      headline.style.transform = `translate3d(0, ${((1 - showHead) * 16).toFixed(2)}px, 0)`;
    }
    if (reveal) {
      reveal.style.opacity = show.toFixed(3);
      reveal.style.transform = `translate3d(0, ${((1 - show) * 12).toFixed(2)}px, 0)`;
      reveal.style.pointerEvents = show > 0.5 ? 'auto' : 'none';
    }
  };

  // the scroll position (0..1) and the smoothed value that is painted
  const state = { target: 0, shown: 0 };
  // quickTo keeps ONE tween and only moves its end: a new linear tween on every scroll event restarted the speed each time (steppy motion)
  const glide = gsap.quickTo(state, 'shown', { duration: o.smooth, ease: 'power2.out', onUpdate: () => paint(state.shown) });
  const follow = () => glide(state.target);

  const measure = () => {
    const box = stage.getBoundingClientRect();
    stageW = box.width;
    stageH = box.height;
    gridW = grid.offsetWidth;
    gridH = grid.offsetHeight;
    paint(state.shown);
  };

  const trigger = ScrollTrigger.create({
    trigger: root,
    start: 'top top',
    end: 'bottom bottom',
    invalidateOnRefresh: true,
    onUpdate: (self) => {
      state.target = self.progress;
      follow();
    },
    onRefresh: (self) => {
      state.target = state.shown = self.progress;
      measure();
    },
  });

  const watch = new ResizeObserver(measure);
  watch.observe(stage);
  watch.observe(grid);
  if (reveal) watch.observe(reveal);

  state.target = state.shown = trigger.progress;
  measure();

  return () => {
    gsap.killTweensOf(state);
    trigger.kill();
    watch.disconnect();
    [grid, headline, reveal, ...tiles].forEach((el) => el?.removeAttribute('style'));
  };
}
