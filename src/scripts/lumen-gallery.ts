// A "Lumen" gallery page (markup and the description of the two phases: LumenGallery.astro).
//
// HERO: the hero opens at the full screen height and settles to 75 % after 0.9 s. A "scroll" (wheel, swipe or key; the page itself never scrolls:
//   the gestures are caught and turned into a number) moves `heroLerp`, which eases 6 % of the way to its target each frame. That number
//   pulls the grid layer up over the hero (the grid's top edge is the hero's bottom edge), shrinks the wordmark to 60 %, blurs it to 8 px and
//   fades it. Past halfway the page finishes the move by itself; at 80 % the header comes in and the grid leaves its "intro" layout for zoom
//   level 2 (the pictures glide to their new places with GSAP Flip, 1.2 s).
// GRID: the hero is gone. The grid moves inside a box by transform (`vlerp`, 10 % per frame); the faster it moves the more the whole grid shrinks
//   (to 96 %), springing back when it stops. + / - change the zoom: the pictures on screen blur out one after another (0.08 s apart), the grid
//   is laid out again and the pictures blur back in. On a desktop a mouse over a photo lifts it like paper (lumen-paper.ts). A click opens the
//   photo large: it grows from its place in the grid to the middle of the screen (FLIP: measure First and Last, Invert with a transform, Play).
// initLumenGallery(root) returns destroy().

import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { QUART, SINE } from './lumen-ease';
import { createLerp, scrollGestures } from './lumen-scroll';
import { neighbourZoom, placeItem, spacingFor, type Level } from './lumen-grid';
import { initPaperHover } from './lumen-paper';
import { getLenis } from './lenis';
import { transitionDone } from './lifecycle';
import { disposeLayer } from './lumen-layer';
import { createSpiral, type Spiral } from './lumen-spiral';
import { foldIn } from './lumen-fold';
import { WEBGL_ENABLED, SMOOTH_WHEEL, SMOOTH_TOUCH } from './settings';

gsap.registerPlugin(Flip);

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function initLumenGallery(root: HTMLElement): () => void {
  const q = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
  const hero = q<HTMLElement>('.lg-hero');
  const heroLabel = q<HTMLElement>('.lg-hero-label');
  const logoBox = q<HTMLElement>('.lg-logo-box');
  const logo = q<HTMLElement>('.lg-logo');
  const content = q<HTMLElement>('.lg-content');
  const vscroll = q<HTMLElement>('.lg-vscroll');
  const scaler = q<HTMLElement>('.lg-scaler');
  const track = q<HTMLElement>('.lg-track');
  const grid = q<HTMLElement>('.lg-grid');
  const items = Array.from(grid.querySelectorAll<HTMLElement>('.lg-item'));
  const images = items.map((item) => item.querySelector<HTMLImageElement>('img')!);
  const box = q<HTMLElement>('.lg-box');
  const boxBg = q<HTMLElement>('.lg-box-bg');
  const boxImg = q<HTMLImageElement>('.lg-box-img');
  const boxClose = q<HTMLButtonElement>('.lg-box-close');
  const strip = q<HTMLElement>('.lg-strip');
  const ending = q<HTMLElement>('.lg-ending');
  const endClip = ending.querySelector<HTMLElement>('[data-footer-clip]');
  const endPhoto = ending.querySelector<HTMLElement>('[data-footer-photo]');
  const endFooter = ending.querySelector<HTMLElement>('[data-footer]');
  const endContent = ending.querySelector<HTMLElement>('[data-footer-content]');
  const ghost = q<HTMLImageElement>('.lg-box-ghost');

  // start="grid" (the /gallery page): no hero and no chooser: the page is white, the spiral of photos flies (data-intro lists them), and when it
  // lands the grid is there at once, its pictures blurring in, the numbers, the header and the zoom buttons with them
  const startGrid = root.dataset.start === 'grid';
  const introSources = (root.dataset.intro ?? '').split('|').filter(Boolean);
  const waiting = startGrid && introSources.length > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches && WEBGL_ENABLED;

  const desktopQuery = matchMedia('(min-width: 1024px)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  let isDesktop = desktopQuery.matches;

  // ---- state ----
  let phase: 'hero' | 'dismissing' | 'grid' = 'hero';
  let introPlaying = true; // scrolling is ignored until the hero has settled
  let heroDismissed = false;
  let heroAnimating = false;
  let lightboxOpen = false;
  let zoom: Level = 'intro';
  let zooming = false;
  let zoomedByHero = false;
  let heroH = 0;
  let lastHero = 0;

  // ---- the page takes the gallery's colour (no flash of another one between pages) and the page's own scroll is off ----
  const previousBackground = document.documentElement.style.backgroundColor;
  document.documentElement.style.backgroundColor = root.dataset.bg ?? '';
  getLenis()?.stop();

  // ---- the grid: layout ----
  const applyLayout = (level: Level) => {
    const s = spacingFor(level, isDesktop);
    // on the grid page the first row keeps clear of the site's pill
    let paddingTop = startGrid ? Math.max(s.paddingTop, isDesktop ? 150 : 120) : s.paddingTop;
    // the two large pictures of the grid page's opening, on a phone: one above the other in the middle of the screen (not at the top with a big gap
    // under them)
    if (startGrid && level === 'intro' && !isDesktop) {
      const colW = window.innerWidth - s.paddingLeft - s.paddingRight;
      const heights = [0, 1].map((i) => {
        const w = Number(images[i]?.getAttribute('width'));
        const h = Number(images[i]?.getAttribute('height'));
        return w && h ? (colW * h) / w : colW * 0.75;
      });
      const total = heights[0] + heights[1] + s.gapY;
      paddingTop = Math.max(100, (window.innerHeight - total) / 2);
    }
    grid.style.paddingTop = `${paddingTop}px`;
    grid.style.paddingBottom = `${s.paddingBottom}px`;
    grid.style.paddingLeft = `${s.paddingLeft}px`;
    grid.style.paddingRight = `${s.paddingRight}px`;
    grid.style.gridTemplateColumns = `repeat(${s.cols}, minmax(0, 1fr))`;
    grid.style.columnGap = `${s.gapX}px`;
    grid.style.rowGap = `${s.gapY}px`;
    items.forEach((item, i) => {
      const place = placeItem(i, level, isDesktop);
      item.style.gridColumn = place.gridColumn;
      item.style.gridRow = place.gridRow;
    });
  };
  // the grid page starts in the big "intro" layout (two large pictures side by side) and glides to level 2 by itself once they are there
  if (startGrid) zoom = 'intro';
  applyLayout(zoom);

  // ---- the pictures blur in the first time 10 % of them is on screen (the first ones 0.08 s apart) ----
  let revealer: IntersectionObserver | undefined;
  // the first pictures (when the grid comes in after the intro) arrive slowly, one after another, from the top of the screen down; later ones, as
  // they scroll into view, quickly
  // the pictures react to the pointer (the paper lift) and open on a click only when the entrance is over: until then they may not even be there yet
  let interactive = !startGrid;
  let firstBatch = false;
  let pagesDone = false;
  const reveal = (item: HTMLElement) => {
    const index = Number(item.dataset.index);
    if (startGrid && index < 2) return; // the two large pictures come in turned over like pages (see enterGrid)
    if (firstBatch) {
      const top = item.getBoundingClientRect().top;
      const order = Math.max(0, Math.min(top / window.innerHeight, 1)) * 0.7 + index * 0.025;
      gsap.to(item, { opacity: 1, filter: 'blur(0px)', duration: 1.3, delay: order, ease: SINE, overwrite: 'auto' });
      return;
    }
    gsap.to(item, { opacity: 1, filter: 'blur(0px)', duration: 0.6, delay: Math.min(0.08 * index, 0.2), ease: SINE, overwrite: 'auto' });
  };
  const observeItems = () => {
    revealer?.disconnect();
    revealer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          // on the grid page nothing but the two large pictures shows until they have turned over; the rest is let in as the grid forms
          if (startGrid && !pagesDone) continue;
          reveal(entry.target as HTMLElement);
          revealer?.unobserve(entry.target);
        }
      },
      { threshold: 0.1 },
    );
    items.forEach((item) => revealer!.observe(item));
  };
  let revealOn = !startGrid;
  if (revealOn) observeItems();

  // ---- the grid: its own scroll (by transform) ----
  const sizes = { content: 0, container: 0 };
  const maxScroll = () => Math.max(0, sizes.content - sizes.container);
  let position = 0;
  let lastForScale = 0;
  let scale = 1;

  // The closing photo and the footer under the grid, as on the home page: the photo drifts slowly; as the footer rises the photo is clipped inward
  // and the footer's content scales from 75 % to 100 % while it fades in. The home page does this with the page's scroll; here it follows the
  // grid's own (the position of the footer on the screen). Reduced motion: no effect, the footer simply follows the photo.
  const endingFx = !matchMedia('(prefers-reduced-motion: reduce)').matches && !!endClip && !!endFooter && !!endContent;
  if (endingFx) {
    ending.dataset.fx = '';
    endContent!.style.opacity = '0';
  }
  const updateEnding = () => {
    if (!endingFx) return;
    const vh = window.innerHeight;
    const clip = endClip!.getBoundingClientRect();
    if (clip.top > vh * 1.2 || clip.bottom < -vh) return; // not near the screen
    const wide = window.innerWidth >= 992;
    const foot = endFooter!.getBoundingClientRect();
    const p = clamp((vh * 0.7 - foot.top) / (vh * 0.7), 0, 1);
    const side = (wide ? 22 : 20) * p;
    const edge = (wide ? 8 : 4) * p;
    endClip!.style.clipPath = `inset(${edge}% ${side}% ${edge}% ${side}%)`;
    endContent!.style.opacity = String(p);
    endContent!.style.transform = `scale(${0.75 + 0.25 * p})`;
    if (endPhoto) {
      const q = clamp((vh - clip.top) / (vh + clip.height), 0, 1);
      endPhoto.style.transform = `translate3d(0, ${(-5 + 10 * q).toFixed(2)}%, 0)`;
    }
  };

  const onGridUpdate = (v: number) => {
    position = v;
    const speed = Math.abs(v - lastForScale);
    lastForScale = v;
    const goal = speed < 0.1 ? 1 : 1 - 0.04 * Math.min(speed / 80, 1);
    scale += (goal - scale) * 0.15;
    grid.style.transform = `scale(${scale})`; // only the grid breathes while scrolling, not the footer under it
    track.style.transform = `translate3d(0, ${-clamp(v, 0, maxScroll())}px, 0)`;
    updateEnding();
  };
  const vlerp = createLerp({ lerpFactor: 0.15, glide: SMOOTH_WHEEL.duration, onUpdate: onGridUpdate });

  const measureGrid = () => {
    sizes.content = track.offsetHeight; // the grid and the closing block under it
    sizes.container = vscroll.clientHeight;
    if (vlerp.getTarget() > maxScroll()) vlerp.jump(maxScroll());
  };
  const gridResizer = new ResizeObserver(measureGrid);
  gridResizer.observe(grid);
  gridResizer.observe(ending);
  gridResizer.observe(vscroll);
  measureGrid();

  // ---- the hero ----
  const heroLerp = createLerp({ lerpFactor: 0.06, onUpdate: onHeroUpdate });

  function onHeroUpdate(v: number) {
    const H = heroH;
    gsap.set(logo, {
      scale: H ? 1 - (v / H) * 0.4 : 1,
      filter: `blur(${H ? (v / H) * 8 : 0}px)`,
      opacity: H ? 1 - v / H : 1,
    });
    gsap.set(heroLabel, { filter: `blur(${H ? (v / H) * 8 : 0}px)`, opacity: H ? 1 - v / H : 1 });
    content.style.transform = `translate3d(0, ${H - Math.min(v, H)}px, 0)`;
    const goingUp = v < lastHero;
    lastHero = v;
    if (goingUp) return;
    if (H > 0) {
      const progress = Math.min(v / H, 1);
      if (v > 0) heroAnimating = heroAnimating || phase !== 'grid';
      // at 80 % the grid leaves its big intro layout for zoom level 2
      if (progress >= 0.8 && !zoomedByHero) {
        zoomedByHero = true;
        changeLevel(2, 'flip');
      }
      // past halfway the hero finishes leaving on its own
      if (progress >= 0.5 && phase === 'hero') {
        phase = 'dismissing';
        heroAnimating = true;
        heroLerp.setTarget(H);
      }
    }
    if (v >= H && phase === 'dismissing') {
      phase = 'grid';
      heroDismissed = true;
      heroAnimating = false;
      hero.style.opacity = '0';
    }
  }

  const measureHero = () => {
    heroH = hero.offsetHeight;
    onHeroUpdate(heroLerp.getValue());
  };
  const heroResizer = new ResizeObserver(measureHero);
  if (!startGrid) {
    heroResizer.observe(hero);
    measureHero();
  }

  // the hero's own entrance: it opens at the full height and settles to 75 % (a long, soft settle)
  const entrance = gsap.timeline();
  if (!startGrid) {
  entrance.fromTo(hero, { height: window.innerHeight }, { height: window.innerHeight * 0.75, duration: 2.4, delay: 0.9, ease: 'power3.out', onComplete: () => (introPlaying = false) }, 0);
  entrance.fromTo(logoBox, { opacity: 0 }, { opacity: 1, duration: 1.5, ease: 'none', delay: 0.9 }, 0);
  entrance.fromTo(heroLabel.firstElementChild, { opacity: 0, y: -40 }, { opacity: 1, y: 0, duration: 1.4, delay: 1.6, ease: 'power3.out' }, 0);
  }

  // the grid page: no hero at all (it never returns), the grid is where it will stay
  if (startGrid) {
    phase = 'grid';
    heroDismissed = true;
    introPlaying = false;
    zoomedByHero = true;
    hero.style.display = 'none';
    content.style.transform = 'translate3d(0, 0, 0)';
  }

  // ---- index labels and zoom buttons appear once the grid has taken over ----

  // ---- zoom ----
  // 'flip': the pictures glide to their new places. 'fade': the ones on screen blur out one after another, the grid is laid out again, they blur back in.
  function changeLevel(level: Level, how: 'flip' | 'fade') {
    if (how === 'flip') {
      const state = Flip.getState(items);
      zoom = level;
      applyLayout(level);
      Flip.from(state, { duration: 1.2, ease: QUART, overwrite: 'auto' });
      return;
    }
    zooming = true;
    paper.leave();
    const visible = items.filter((item) => {
      const r = item.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
    });
    gsap.to(visible, {
      opacity: 0,
      filter: 'blur(6px)',
      duration: 0.6,
      ease: SINE,
      stagger: 0.08,
      overwrite: 'auto',
      onComplete: () => {
        zoom = level;
        applyLayout(level);
        gsap.set(items, { opacity: 0, filter: 'blur(6px)' });
        measureGrid();
        observeItems();
        zooming = false;
      },
    });
  }

  const onDesktopChange = () => {
    isDesktop = desktopQuery.matches;
    applyLayout(zoom);
    measureGrid();
  };
  desktopQuery.addEventListener('change', onDesktopChange);

  // ---- paper hover (a mouse on a desktop) ----
  const paper = initPaperHover();
  const hoverEnters: Array<(e: PointerEvent) => void> = [];
  const hoverMoves: Array<(e: PointerEvent) => void> = [];
  const hoverLeaves: Array<(e: PointerEvent) => void> = [];
  images.forEach((img, i) => {
    // not on a picture that is still coming in (faded, blurred): the lifted copy is drawn in full colour and would show it before its time
    const shown = () => Number(getComputedStyle(items[i]).opacity) > 0.97;
    hoverEnters[i] = (e) => interactive && finePointer.matches && isDesktop && !lightboxOpen && shown() && paper.enter(e, img);
    hoverMoves[i] = (e) => interactive && finePointer.matches && isDesktop && paper.move(e, img);
    hoverLeaves[i] = (e) => paper.leave(e, img);
    img.addEventListener('pointerenter', hoverEnters[i]);
    img.addEventListener('pointermove', hoverMoves[i]);
    img.addEventListener('pointerleave', hoverLeaves[i]);
  });

  // ---- the photo opened large ----
  let closing = false;
  let source: HTMLImageElement | undefined;
  // ---- the strip of small pictures down the left of the opened one ----
  let currentIndex = 0;
  let boxReady = false; // the strip and the arrows work once the picture has finished growing, and not while it is closing
  let switching = false;
  let wanted = 0; // the picture asked for last (it may be ahead of the one shown while a switch is running)
  const thumbs = images.map((img, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lg-thumb';
    button.setAttribute('aria-label', `Show picture ${img.dataset.id}: ${img.dataset.title}`);
    const small = document.createElement('img');
    small.src = img.currentSrc || img.src;
    small.alt = '';
    small.loading = 'lazy';
    small.decoding = 'async';
    small.draggable = false;
    button.appendChild(small);
    button.dataset.i = String(i);
    strip.appendChild(button);
    return button;
  });
  const markActive = (index: number, smooth = true) => {
    thumbs.forEach((t, i) => t.classList.toggle('is-active', i === index));
    const t = thumbs[index];
    const behavior = smooth ? 'smooth' : 'auto';
    // on a phone the strip lies along the bottom and runs sideways, on a desktop it stands down the left
    if (window.innerWidth < 1024) strip.scrollTo({ left: t.offsetLeft - strip.clientWidth / 2 + t.clientWidth / 2, behavior });
    else strip.scrollTo({ top: t.offsetTop - strip.clientHeight / 2 + t.clientHeight / 2, behavior });
  };
  // another picture (from the strip, the keys or the wheel): the opened one is a page of a book that turns over and the next is under it. The page is
  // made over the picture first (flat, exactly over it) and only then the picture under it is changed, so there is no frame without a picture.
  // (The grid moves behind the box so that the one the box will fly back to on closing is on the screen.)
  const select = (index: number) => {
    if (!lightboxOpen || !boxReady || closing || index < 0 || index >= images.length) return;
    if (switching) {
      wanted = index; // the person is going faster than the pictures change: the last one asked for is shown when this one is done
      return;
    }
    if (index === currentIndex) return;
    switching = true;
    wanted = index;
    const next = images[index];
    const forward = index > currentIndex;
    markActive(index);
    const finish = () => {
      switching = false;
      if (wanted !== currentIndex) {
        select(wanted);
        return;
      }
      const full = next.dataset.full;
      if (!full) return;
      const big = new Image();
      big.src = full;
      big.decode().then(
        () => {
          if (lightboxOpen && source === next && !switching) boxImg.src = full;
        },
        () => {},
      );
    };
    const change = async () => {
      const nextSrc = next.currentSrc || next.src;
      // the next picture waits in the second image (not drawn: opacity 0) where it will stand; the turn-over sheet follows it
      const preload = new Image();
      preload.src = nextSrc;
      try {
        await preload.decode();
      } catch {
        /* it shows when it is there */
      }
      if (!lightboxOpen) {
        switching = false;
        return;
      }
      const r = next.getBoundingClientRect();
      vlerp.jump(clamp(position + r.top - (window.innerHeight - r.height) / 2, 0, maxScroll()));
      ghost.src = nextSrc;
      const nextRect = fitBox(next, ghost);
      try {
        await ghost.decode();
      } catch {
        /* it shows when it is there */
      }
      const land = async () => {
        // the next picture stands where the sheet turned (the second image shows it); the shown one takes its place once it has the new picture
        // loaded, and only then the second image goes: there is never a frame with the old one
        gsap.set(ghost, { opacity: 1 });
        gsap.killTweensOf(boxImg);
        natural = fitBox(next);
        boxImg.src = nextSrc;
        boxImg.alt = next.alt;
        try {
          await boxImg.decode();
        } catch {
          /* it shows when it is there */
        }
        gsap.set(boxImg, { x: 0, y: 0, scale: 1, opacity: 1 });
        gsap.set(ghost, { opacity: 0 });
        if (source) source.style.visibility = '';
        source = next;
        next.style.visibility = 'hidden';
        currentIndex = index;
        navIndex = index;
        finish();
      };
      // the one shown fades away under the sheet while it turns over (it may be a different size)
      gsap.to(boxImg, { opacity: 0, duration: 0.7, delay: 0.55, ease: 'power1.inOut' });
      void nextRect;
      foldIn({ container: ghost, image: ghost, direction: forward ? 1 : -1, delay: 0, duration: 1.3, onComplete: land }).then(
        (dispose) => {
          if (lightboxOpen) turns.push(dispose);
          else dispose();
        },
        land, // no WebGL: the picture is simply changed
      );
    };
    void change();
  };
  const thumbClicks = thumbs.map((_, i) => (event: Event) => {
    event.stopPropagation(); // a click in the strip does not close the box
    select(i);
  });
  thumbs.forEach((t, i) => t.addEventListener('click', thumbClicks[i]));
  const stopStrip = (event: Event) => event.stopPropagation();
  strip.addEventListener('click', stopStrip);

  type Box = { left: number; top: number; width: number; height: number };
  const turns: Array<() => void> = [];
  let natural: Box | undefined; // where the large picture rests (measured once it is in the box, before any move)
  // the large picture fills the box as far as it goes (80 % of the window each way) in the proportions of the grid's picture; its size is set from
  // those proportions, so it is known before the file is loaded and the move can start at once (and the file that replaces the small one later has
  // the same size, whatever the screen)
  const fitBox = (source: HTMLImageElement, el: HTMLImageElement = boxImg): Box => {
    const aspect = (source.naturalWidth || source.width) / (source.naturalHeight || source.height) || 4 / 3;
    // the area under the site's pill (it is about 100 px from the top) and clear of the strip: on a desktop the strip is on the left, on a phone it
    // lies along the bottom (the full width); the X sits under the pill, so the photo starts below it, so the photo gets the whole width
    const phone = window.innerWidth < 1024;
    const top = phone ? 164 : 104;
    const bottom = phone ? 96 : 28;
    const left = phone ? 12 : 100;
    const areaW = phone ? window.innerWidth - 24 : window.innerWidth - left - 24;
    const areaH = window.innerHeight - top - bottom;
    const width = Math.min(areaW * (phone ? 1 : 0.94), areaH * aspect);
    const height = width / aspect;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    const x = left + (areaW - width) / 2;
    const y = top + (areaH - height) / 2;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    return { left: x, top: y, width, height };
  };
  const openPicture = (img: HTMLImageElement) => {
    if (lightboxOpen || closing || !heroDismissed || !interactive) return;
    paper.leave();
    source = img;
    lightboxOpen = true;
    currentIndex = images.indexOf(img);
    navIndex = currentIndex;
    markActive(currentIndex, false);
    gsap.set(boxImg, { opacity: 1 });
    const from = img.getBoundingClientRect();
    // the picture the grid already has (cached, so it is there at once) grows first; the large file is fetched and decoded in the background and
    // takes its place when the move is over (same proportions, so nothing shifts)
    boxImg.src = img.currentSrc || img.src;
    boxImg.alt = img.alt;
    gsap.set(boxImg, { x: 0, y: 0, scale: 1, opacity: 0 }); // placed over its tile by start() below
    gsap.set(boxBg, { opacity: 0 });
    gsap.set(strip, { opacity: 0 });
    natural = fitBox(img);
    box.hidden = false;
    // the grid stays exactly as it is while the white comes in over it
    gsap.to(boxBg, { opacity: 1, duration: 0.55, ease: 'power2.out' });
    gsap.to(strip, { opacity: 1, duration: 0.8, delay: 0.6, ease: 'power1.out' });
    gsap.set(boxClose, { opacity: 0 });
    gsap.to(boxClose, { opacity: 1, duration: 0.6, delay: 0.6, ease: 'power1.out' });
    const shown = () => {
      if (!lightboxOpen) return;
      gsap.set(boxImg, { opacity: 1, borderRadius: 0 });
      boxReady = true;
      const full = img.dataset.full;
      if (!full) return;
      const big = new Image();
      big.src = full;
      big.decode().then(
        () => {
          if (lightboxOpen && source === img) boxImg.src = full;
        },
        () => {},
      );
    };
    const start = async () => {
      try {
        await boxImg.decode();
      } catch {
        /* it shows when it is there */
      }
      if (!lightboxOpen) return;
      // the same turn-over as the two pictures of the intro: the picture is turned onto the page (WebGL), and shown when the turn is done
      foldIn({ container: boxImg, image: boxImg, direction: 1, delay: 0.15, duration: 1.4, onComplete: () => {
        img.style.visibility = 'hidden';
        shown();
      } }).then(
        (dispose) => {
          if (lightboxOpen) turns.push(dispose);
          else dispose();
        },
        () => {
          img.style.visibility = 'hidden';
          shown(); // no WebGL: the picture simply appears
        },
      );
    };
    void start();
  };
  const closePicture = () => {
    if (!lightboxOpen || closing || !source || !natural) return;
    closing = true;
    boxReady = false;
    const to = source.getBoundingClientRect();
    const rest = natural;
    gsap.killTweensOf(boxImg);
    gsap.set(boxImg, { opacity: 1 });
    // everything leaves softly together: the strip and the Close pill fade first, the white thins out over the whole flight, the picture
    // glides back on a gentle curve and, once at its tile, melts into it (no hard swap)
    gsap.to([strip, boxClose], { opacity: 0, duration: 0.35, ease: 'power1.out' });
    gsap.to(boxBg, { opacity: 0, duration: 0.75, delay: 0.05, ease: 'power1.inOut' });
    gsap.to(boxImg, {
      x: to.left + to.width / 2 - (rest.left + rest.width / 2),
      y: to.top + to.height / 2 - (rest.top + rest.height / 2),
      scale: to.width / rest.width,
      duration: 1.05,
      ease: 'power2.inOut',
      force3D: true,
      onComplete: () => {
        if (source) source.style.visibility = '';
        gsap.to(boxImg, {
          opacity: 0,
          duration: 0.28,
          ease: 'power1.out',
          onComplete: () => {
            box.hidden = true;
            closing = false;
            lightboxOpen = false;
          },
        });
      },
    });
  };
  const linkClicks: Array<() => void> = [];
  items.forEach((item, i) => {
    const link = item.querySelector<HTMLElement>('.lg-link')!;
    linkClicks[i] = () => openPicture(images[i]);
    link.addEventListener('click', linkClicks[i]);
  });
  box.addEventListener('click', closePicture);
  // ---- going through the pictures with the wheel, the swipe or the keys: at once, with no animation (the turn-over is only for a click on a
  // picture of the grid or of the strip) ----
  let navIndex = 0; // the picture asked for last (the one shown follows it as fast as it is loaded)
  let navToken = 0;
  let upgradeTimer = 0;
  const jumpTo = (index: number) => {
    if (!lightboxOpen || !boxReady || closing || switching) return;
    const target = ((index % images.length) + images.length) % images.length; // round and round: after the last comes the first
    if (target === navIndex) return;
    navIndex = target;
    markActive(target, false);
    const token = ++navToken;
    const next = images[target];
    const nextSrc = next.currentSrc || next.src;
    const preload = new Image();
    preload.src = nextSrc;
    const apply = () => {
      if (token !== navToken || !lightboxOpen || closing || switching) return; // a later one has been asked for since
      const r = next.getBoundingClientRect();
      vlerp.jump(clamp(position + r.top - (window.innerHeight - r.height) / 2, 0, maxScroll()));
      gsap.killTweensOf(boxImg);
      natural = fitBox(next);
      boxImg.src = nextSrc;
      boxImg.alt = next.alt;
      gsap.set(boxImg, { x: 0, y: 0, scale: 1, opacity: 1 });
      if (source) source.style.visibility = '';
      source = next;
      next.style.visibility = 'hidden';
      currentIndex = target;
      // the large file replaces the small one when the going has stopped for a moment
      window.clearTimeout(upgradeTimer);
      upgradeTimer = window.setTimeout(() => {
        const full = next.dataset.full;
        if (!full || token !== navToken) return;
        const big = new Image();
        big.src = full;
        big.decode().then(
          () => {
            if (lightboxOpen && token === navToken && !switching) boxImg.src = full;
          },
          () => {},
        );
      }, 350);
    };
    preload.decode().then(apply, apply);
  };

  // the mouse wheel over the opened picture: a picture for every notch (about 90 px of wheel), as many as the person turns, with no end (after the last comes the first)
  let wheelAcc = 0;
  let wheelAt = 0;
  const onBoxWheel = (event: WheelEvent) => {
    if (!lightboxOpen) return;
    if ((event.target as Element | null)?.closest('.lg-strip')) return; // over the strip the wheel scrolls the strip itself
    event.preventDefault();
    if (!boxReady) return;
    const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? window.innerHeight : 1;
    const now = performance.now();
    const delta = event.deltaY * unit;
    let steps = 0;
    if (Math.abs(delta) >= 60) {
      // a notch of a wheel: exactly one picture (or one for every 100 px, if the wheel sends bigger steps)
      steps = Math.sign(delta) * Math.max(1, Math.round(Math.abs(delta) / 100));
      wheelAcc = 0;
    } else {
      // a trackpad's small movements add up (the sum starts again after a pause or a change of direction)
      if (now - wheelAt > 250 || Math.sign(delta) !== Math.sign(wheelAcc)) wheelAcc = 0;
      wheelAcc += delta;
      steps = Math.trunc(wheelAcc / 90);
      wheelAcc -= steps * 90;
    }
    wheelAt = now;
    if (!steps) return;
    jumpTo(navIndex + steps);
  };
  box.addEventListener('wheel', onBoxWheel, { passive: false });
  // a vertical swipe over the opened picture does the same on a touch screen
  let swipeY = 0;
  const onBoxTouchStart = (event: TouchEvent) => {
    swipeY = event.touches[0]?.clientY ?? 0;
  };
  const onBoxTouchEnd = (event: TouchEvent) => {
    if (!lightboxOpen || !boxReady || switching) return;
    if ((event.target as Element | null)?.closest('.lg-strip')) return;
    const dy = (event.changedTouches[0]?.clientY ?? swipeY) - swipeY;
    if (Math.abs(dy) > 60) jumpTo(navIndex + (dy < 0 ? 1 : -1));
  };
  box.addEventListener('touchstart', onBoxTouchStart, { passive: true });
  box.addEventListener('touchend', onBoxTouchEnd, { passive: true });
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closePicture();
    else if (lightboxOpen && (event.key === 'ArrowDown' || event.key === 'ArrowRight')) jumpTo(navIndex + 1);
    else if (lightboxOpen && (event.key === 'ArrowUp' || event.key === 'ArrowLeft')) jumpTo(navIndex - 1);
  };
  document.addEventListener('keydown', onKey);

  // the grid is at its top and the person scrolls up: the hero comes back under it (the same move as on the way in, backwards)
  function returnToHero(delta: number) {
    phase = 'hero';
    heroDismissed = false;
    heroAnimating = false;
    hero.style.opacity = '1';
    lastHero = heroH + 1; // so the jump to the full height counts as a move up and does not dismiss the hero again
    heroLerp.jump(heroH);
    heroLerp.setTarget(clamp(heroH + delta, 0, heroH));
  }

  // ---- gestures: before the hero is gone they move the hero, afterwards the grid ----
  const stopGestures = scrollGestures({
    wheelMultiplier: SMOOTH_WHEEL.wheelMultiplier, // the same weight as the rest of the site
    touchMultiplier: SMOOTH_TOUCH.touchMultiplier,
    touchInertia: 1, // a flick carries on after the finger lifts and slows down smoothly (a gentle decay, not one push)
    enabled: () => !lightboxOpen && revealOn,
    onDelta: (delta, kind) => {
      if (phase === 'grid') {
        // at the very top of the grid a further scroll up brings the hero back
        if (delta < 0 && position <= 4 && !startGrid) {
          returnToHero(delta);
          return;
        }
        vlerp.setTarget((target) => clamp(target + delta, 0, maxScroll()), kind);
        return;
      }
      if (introPlaying || phase !== 'hero') return;
      heroLerp.setTarget((target) => clamp(target + delta, 0, heroH));
    },
  });

  // the pictures, the numbers, the header and the zoom buttons come in (at once, or when the spiral of the intro lands)
  const enterGrid = () => {
    if (!startGrid || revealOn) return;
    revealOn = true;
    firstBatch = true;
    observeItems(); // the pictures below blur in as they come into view
    // the two large pictures are turned over onto the page, one after the other (the page-turn the chooser's covers had), then, by itself,
    // the pictures part and the grid forms: the same glide as when the grid came up over the hero
    const glide = () => {
      pagesDone = true;
      glideTimer = window.setTimeout(() => {
        if (!alive) return;
        changeLevel(2, 'flip');
        observeItems(); // now the rest may come in, as the pictures glide to their places
        interactiveTimer = window.setTimeout(() => (interactive = true), 1700); // the glide takes 1.2 s
      }, 700);
    };
    let turned = 0;
    const landed = (item: HTMLElement) => {
      gsap.set(item, { opacity: 1, filter: 'blur(0px)' });
      if (++turned === 2) glide();
    };
    items.slice(0, 2).forEach((item, i) => {
      foldIn({ container: item, image: images[i], direction: -i, delay: 0.4 * i, duration: 1.4, onComplete: () => landed(item) }).then(
        (dispose) => {
          if (!alive) dispose();
          else folds.push(dispose);
        },
        () => landed(item), // no WebGL texture: the picture simply appears
      );
    });
    window.setTimeout(() => (firstBatch = false), 5200);
  };
  let spiral: Spiral | undefined;
  let alive = true;
  let safety = 0;
  let gridTimer = 0;
  let glideTimer = 0;
  let interactiveTimer = 0;
  const folds: Array<() => void> = [];
  if (startGrid) {
    if (!waiting) enterGrid();
    else {
      createSpiral(introSources).then(
        (s) => {
          if (!alive) {
            s.dispose();
            return;
          }
          spiral = s;
          // the last photo of the spiral is gone at about 6.5 s: the grid follows a moment after, when the screen has been empty for a breath
          // the intro starts only when the page transition has ended (it used to run under the page still sliding in)
          void transitionDone().then(() => {
            if (!alive) return;
            window.clearTimeout(safety);
            safety = window.setTimeout(enterGrid, 11000);
            s.play(() => (gridTimer = window.setTimeout(enterGrid, 1700)));
          });
        },
        enterGrid, // the photos or WebGL failed: the grid at once
      );
      safety = window.setTimeout(enterGrid, 11000);
    }
  }

  return () => {
    alive = false;
    window.clearTimeout(safety);
    window.clearTimeout(gridTimer);
    window.clearTimeout(glideTimer);
    window.clearTimeout(interactiveTimer);
    folds.splice(0).forEach((d) => d());
    turns.splice(0).forEach((d) => d());
    spiral?.dispose();
    stopGestures();
    heroLerp.destroy();
    vlerp.destroy();
    revealer?.disconnect();
    gridResizer.disconnect();
    heroResizer.disconnect();
    entrance.kill();
    gsap.killTweensOf([hero, logo, logoBox, heroLabel, content, items, boxImg, boxBg]);
    desktopQuery.removeEventListener('change', onDesktopChange);
    images.forEach((img, i) => {
      img.removeEventListener('pointerenter', hoverEnters[i]);
      img.removeEventListener('pointermove', hoverMoves[i]);
      img.removeEventListener('pointerleave', hoverLeaves[i]);
    });
    items.forEach((item, i) => item.querySelector('.lg-link')?.removeEventListener('click', linkClicks[i]));
    box.removeEventListener('click', closePicture);
    window.clearTimeout(upgradeTimer);
    box.removeEventListener('wheel', onBoxWheel);
    box.removeEventListener('touchstart', onBoxTouchStart);
    box.removeEventListener('touchend', onBoxTouchEnd);
    thumbs.forEach((t, i) => t.removeEventListener('click', thumbClicks[i]));
    strip.removeEventListener('click', stopStrip);
    document.removeEventListener('keydown', onKey);
    paper.destroy();
    disposeLayer('top');
    getLenis()?.start();
    document.documentElement.style.backgroundColor = previousBackground;
  };
}
