// The photo wall for phones and tablets, without WebGL: plain <img> tiles in staggered columns on one track that slides sideways (slowly by
// itself, and with the finger, a flick glides on). A tap opens the photo large. No canvas, no texture, no lens: the WebGL wall
// (gallery-dome.ts) stays for laptops and desktops. Same markup, settings and look of the tiles (size, gap, rounded corners).
//  - the whole wall is ONE moving element (the track, a transform): the tiles never move on their own,
//  - endless: the track holds the columns twice and wraps by one set of them,
//  - a finger moves it sideways only (touch-action: pan-y on the stage): a vertical swipe scrolls the page,
//  - it only moves while on the screen, and stands still from the moment a page transition starts,
//  - the entrance on the stripes is CSS (--sr-intro, see GalleryDome.astro).
//
// Expected markup (GalleryDome.astro): root > .gd-stage, ul.gd-list > li > img[data-full], .gd-box (img, .gd-caption-text, .gd-count,
// .gd-prev, .gd-next, .gd-close). initGalleryCssWall(root) returns destroy().

import { GALLERY_DOME } from './settings';
import { getLenis } from './lenis';
import { clamp } from './math';

const o = GALLERY_DOME;
const TAP_TRAVEL = 8; // px: a press that moved less than this, and was short, is a tap
const TAP_TIME = 500; // ms
const MAX_FLICK = 3000; // px/s

const mod = (a: number, b: number) => ((a % b) + b) % b;

export function initGalleryCssWall(root: HTMLElement): (() => void) | undefined {
  const stage = root.querySelector<HTMLElement>('.gd-stage');
  const list = root.querySelector<HTMLElement>('.gd-list');
  const box = root.querySelector<HTMLElement>('.gd-box');
  const boxImage = box?.querySelector<HTMLImageElement>('img');
  const boxClose = box?.querySelector<HTMLButtonElement>('.gd-close');
  const boxPrev = box?.querySelector<HTMLButtonElement>('.gd-prev');
  const boxNext = box?.querySelector<HTMLButtonElement>('.gd-next');
  const boxText = box?.querySelector<HTMLElement>('.gd-caption-text');
  const boxCount = box?.querySelector<HTMLElement>('.gd-count');
  if (!stage || !list || !box || !boxImage || !boxClose || !boxPrev || !boxNext || !boxText || !boxCount) return;
  const images = Array.from(list.querySelectorAll<HTMLImageElement>('img'));
  if (!images.length) return;

  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedQuery.matches;

  const wall = document.createElement('div');
  wall.className = 'gd-css';
  const track = document.createElement('div');
  track.className = 'gd-track';
  wall.appendChild(track);
  stage.appendChild(wall);

  // ---- the tiles ----
  let width = 0;
  let height = 0;
  let setWidth = 0; // the width of one set of columns: the track wraps by it
  const build = () => {
    const w = Math.round(root.clientWidth);
    const h = Math.round(root.clientHeight);
    if (w < 2 || h < 2 || (w === width && h === height)) return;
    width = w;
    height = h;
    const tileW = clamp(Math.min(w, h) * o.tileShare, o.tileMin, o.tileMax);
    const tileH = tileW / o.aspect;
    const pitchX = tileW + tileW * o.gap;
    const pitchY = tileH + tileW * o.gap;
    let cols = Math.ceil(w / pitchX) + 1;
    if (cols % 2) cols++; // an even count, so the stagger (every other column lower) carries on over the wrap
    const rows = Math.ceil(h / pitchY) + 2;
    setWidth = cols * pitchX;
    const top = (h - rows * pitchY) / 2 - pitchY * 0.25;
    track.textContent = '';
    const fragment = document.createDocumentFragment();
    for (let c = 0; c < cols * 2; c++) {
      const col = c % cols;
      for (let r = 0; r < rows; r++) {
        const index = mod(col * 3 + r * 2, images.length); // neighbours differ, as on the WebGL wall
        const source = images[index];
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'gd-tile';
        tile.dataset.index = String(index);
        tile.setAttribute('aria-label', source.alt || 'Photo');
        tile.tabIndex = -1;
        tile.style.cssText = `left:${c * pitchX}px;top:${top + r * pitchY + (col % 2) * pitchY * 0.5}px;width:${tileW}px;height:${tileH}px;`;
        const img = document.createElement('img');
        img.alt = '';
        img.draggable = false;
        img.decoding = 'async';
        if (source.srcset) {
          img.srcset = source.srcset;
          img.sizes = `${Math.round(tileW)}px`;
        }
        img.src = source.getAttribute('src') ?? source.src;
        tile.appendChild(img);
        fragment.appendChild(tile);
      }
    }
    track.appendChild(fragment);
    place();
  };

  // ---- motion ----
  let offset = 0;
  let velocity = 0;
  let raf = 0;
  let last = 0;
  let visible = false;
  let frozen = false;
  let lightboxOpen = false;
  let press: { id: number; x: number; y: number; lastX: number; t: number; at: number } | null = null;

  const place = () => {
    if (!setWidth) return;
    track.style.transform = `translate3d(${-mod(offset, setWidth)}px,0,0)`;
  };

  const schedule = () => {
    if (frozen || !visible || raf) return;
    raf = requestAnimationFrame(frame);
  };

  function frame(time: number) {
    raf = 0;
    const dt = last && time - last < 100 ? clamp((time - last) / 1000, 0, 0.05) : 1 / 60;
    last = time;
    if (!press) {
      if (reduced) velocity = 0;
      else {
        velocity *= Math.exp(-dt * o.friction);
        if (Math.abs(velocity) < 1) velocity = 0;
        offset += velocity * dt;
        if (!lightboxOpen) offset += o.drift.x * dt;
      }
    }
    place();
    if (!reduced || velocity || press) schedule();
  }

  // ---- input ----
  const onDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.button > 0 || lightboxOpen) return;
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, t: performance.now(), at: performance.now() };
    velocity = 0;
    schedule();
  };
  const onMove = (event: PointerEvent) => {
    if (!press || press.id !== event.pointerId) return;
    const now = performance.now();
    const dt = Math.max(now - press.t, 1) / 1000;
    const dx = event.clientX - press.lastX;
    press.lastX = event.clientX;
    press.t = now;
    offset -= dx;
    velocity = velocity * 0.6 + (-dx / dt) * 0.4;
    if (Math.abs(event.clientX - press.x) > TAP_TRAVEL) root.dataset.touched = '';
    place();
  };
  const onUp = (event: PointerEvent) => {
    if (!press || press.id !== event.pointerId) return;
    const ended = press;
    press = null;
    const travelled = Math.hypot(event.clientX - ended.x, event.clientY - ended.y);
    if (event.type === 'pointerup' && travelled < TAP_TRAVEL && performance.now() - ended.at < TAP_TIME) {
      const tile = (event.target as Element | null)?.closest<HTMLElement>('.gd-tile');
      if (tile) {
        velocity = 0;
        root.dataset.touched = '';
        open(Number(tile.dataset.index));
      }
      return;
    }
    if (performance.now() - ended.t > 80) velocity = 0; // the finger rested before it lifted: not a flick
    velocity = clamp(velocity, -MAX_FLICK, MAX_FLICK);
    schedule();
  };

  // ---- the lightbox (as on the WebGL wall) ----
  let current = 0;
  let lenisStopped = false;
  let openedAt = 0;
  const showPhoto = (index: number) => {
    current = mod(index, images.length);
    const image = images[current];
    boxImage.src = image.dataset.full || image.currentSrc || image.src;
    boxImage.alt = image.alt;
    boxText.textContent = image.alt;
    boxCount.textContent = `${String(current + 1).padStart(2, '0')} / ${String(images.length).padStart(2, '0')}`;
  };
  const open = (index: number) => {
    if (!images[index]) return;
    showPhoto(index);
    openedAt = performance.now();
    document.body.appendChild(box); // out of the section (its own layer sits under the nav pill), over the whole page
    box.hidden = false;
    requestAnimationFrame(() => box.classList.add('is-open'));
    lightboxOpen = true;
    getLenis()?.stop();
    lenisStopped = true;
    boxClose.focus({ preventScroll: true });
  };
  const close = () => {
    if (!lightboxOpen) return;
    lightboxOpen = false;
    box.classList.remove('is-open');
    window.setTimeout(() => {
      if (lightboxOpen) return;
      box.hidden = true;
      root.appendChild(box);
    }, 300);
    if (lenisStopped) getLenis()?.start();
    lenisStopped = false;
    root.focus({ preventScroll: true });
    schedule();
  };
  const onBoxClick = (event: MouseEvent) => {
    // the tap that opened the photo (on pointerup) sends its click a moment later, onto the viewer that is now there: not a tap to close it
    if (performance.now() - openedAt < 500) return;
    const target = event.target as Element;
    if (target !== boxImage && !target.closest('.gd-nav, .gd-close')) close();
  };
  const onPrev = () => showPhoto(current - 1);
  const onNext = () => showPhoto(current + 1);
  const onKey = (event: KeyboardEvent) => {
    if (!lightboxOpen) return;
    if (event.key === 'Escape') close();
    else if (event.key === 'ArrowLeft') onPrev();
    else if (event.key === 'ArrowRight') onNext();
    else return;
    event.preventDefault();
  };
  const onMotion = () => {
    reduced = reducedQuery.matches;
    schedule();
  };

  // a page transition: the wall stands still (the picture of the page is taken of it as it is)
  let thawTimer = 0;
  const freeze = () => {
    frozen = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    window.clearTimeout(thawTimer);
    thawTimer = window.setTimeout(() => {
      frozen = false;
      schedule();
    }, 5000); // the navigation did not happen after all
  };

  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onUp);
  box.addEventListener('click', onBoxClick);
  boxClose.addEventListener('click', close);
  boxPrev.addEventListener('click', onPrev);
  boxNext.addEventListener('click', onNext);
  document.addEventListener('keydown', onKey);
  reducedQuery.addEventListener('change', onMotion);
  document.addEventListener('astro:before-preparation', freeze);

  const resizer = new ResizeObserver(() => build());
  resizer.observe(root);
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) {
      last = 0;
      schedule();
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  });
  observer.observe(root);

  root.dataset.live = ''; // the markup's own list steps aside
  build();
  requestAnimationFrame(() => (root.dataset.ready = ''));

  return () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    frozen = true;
    window.clearTimeout(thawTimer);
    observer.disconnect();
    resizer.disconnect();
    stage.removeEventListener('pointerdown', onDown);
    stage.removeEventListener('pointermove', onMove);
    stage.removeEventListener('pointerup', onUp);
    stage.removeEventListener('pointercancel', onUp);
    box.removeEventListener('click', onBoxClick);
    boxClose.removeEventListener('click', close);
    boxPrev.removeEventListener('click', onPrev);
    boxNext.removeEventListener('click', onNext);
    document.removeEventListener('keydown', onKey);
    reducedQuery.removeEventListener('change', onMotion);
    document.removeEventListener('astro:before-preparation', freeze);
    if (lenisStopped) getLenis()?.start();
    wall.remove();
    box.hidden = true;
    root.appendChild(box);
    delete root.dataset.live;
    delete root.dataset.ready;
  };
}
