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
import { initLumenMenu } from './lumen-menu';
import { getLenis } from './lenis';
import { disposeLayer } from './lumen-layer';

gsap.registerPlugin(Flip);

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function initLumenGallery(root: HTMLElement): () => void {
  const q = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
  const header = q<HTMLElement>('.lg-header');
  const bar = q<HTMLElement>('.lg-bar');
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
  const indexes = items.map((item) => item.querySelector<HTMLElement>('.lg-index')!);
  const zoomBox = q<HTMLElement>('.lg-zoom');
  const zoomIn = q<HTMLButtonElement>('.lg-zoom-btn[data-dir="in"]');
  const zoomOut = q<HTMLButtonElement>('.lg-zoom-btn[data-dir="out"]');
  const box = q<HTMLElement>('.lg-box');
  const boxBg = q<HTMLElement>('.lg-box-bg');
  const boxImg = q<HTMLImageElement>('.lg-box-img');
  const boxCaption = q<HTMLElement>('.lg-box-caption');
  const boxClose = q<HTMLButtonElement>('.lg-box-close');
  const menuRoot = q<HTMLElement>('[data-lumen-menu]');
  const openers = [q<HTMLElement>('.lg-logo-btn'), q<HTMLElement>('.lg-menu-btn')];

  const desktopQuery = matchMedia('(min-width: 1024px)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  let isDesktop = desktopQuery.matches;

  // ---- state ----
  let phase: 'hero' | 'dismissing' | 'grid' = 'hero';
  let introPlaying = true; // scrolling is ignored until the hero has settled
  let heroDismissed = false;
  let heroAnimating = false;
  let headerVisible = false;
  let menuOpen = false;
  let lightboxOpen = false;
  let zoom: Level = 'intro';
  let zooming = false;
  let zoomedByHero = false;
  let heroH = 0;
  let lastHero = 0;
  let downAccumulator = 0;

  const setHeader = () => {
    gsap.to(header, { yPercent: headerVisible && !menuOpen ? 0 : -100, duration: 0.8, ease: QUART, overwrite: 'auto' });
  };

  // ---- the page takes the gallery's colour (no flash of another one between pages) and the page's own scroll is off ----
  const previousBackground = document.documentElement.style.backgroundColor;
  document.documentElement.style.backgroundColor = root.dataset.bg ?? '';
  getLenis()?.stop();

  // ---- the grid: layout ----
  const applyLayout = (level: Level) => {
    const s = spacingFor(level, isDesktop);
    grid.style.paddingTop = `${s.paddingTop}px`;
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
      indexes[i].className = `lg-index ${isDesktop && place.side !== 'bottom-left' ? place.side : ''}`;
    });
  };
  applyLayout(zoom);

  // ---- the pictures blur in the first time 10 % of them is on screen (the first ones 0.08 s apart) ----
  let revealer: IntersectionObserver | undefined;
  const reveal = (item: HTMLElement) => {
    const index = Number(item.dataset.index);
    gsap.to(item, { opacity: 1, filter: 'blur(0px)', duration: 0.6, delay: Math.min(0.08 * index, 0.2), ease: SINE, overwrite: 'auto' });
  };
  const observeItems = () => {
    revealer?.disconnect();
    revealer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          reveal(entry.target as HTMLElement);
          revealer?.unobserve(entry.target);
        }
      },
      { threshold: 0.1 },
    );
    items.forEach((item) => revealer!.observe(item));
  };
  observeItems();

  // ---- the grid: its own scroll (by transform) ----
  const sizes = { content: 0, container: 0 };
  const maxScroll = () => Math.max(0, sizes.content - sizes.container);
  let position = 0;
  let lastForScale = 0;
  let scale = 1;

  const onGridUpdate = (v: number) => {
    const delta = v - position;
    position = v;
    const speed = Math.abs(v - lastForScale);
    lastForScale = v;
    const goal = speed < 0.1 ? 1 : 1 - 0.04 * Math.min(speed / 80, 1);
    scale += (goal - scale) * 0.15;
    scaler.style.transform = `scale(${scale})`;
    track.style.transform = `translate3d(0, ${-clamp(v, 0, maxScroll())}px, 0)`;
    if (delta !== 0) onGridScroll(delta);
  };
  const vlerp = createLerp({ lerpFactor: 0.1, onUpdate: onGridUpdate });

  // once the grid has taken over, the header hides when scrolling down and returns when scrolling up
  function onGridScroll(delta: number) {
    if (!heroDismissed) return;
    if (delta > 0) {
      downAccumulator += delta;
      if (downAccumulator > 60 && headerVisible) {
        headerVisible = false;
        setHeader();
      }
    } else {
      downAccumulator = 0;
      if (!headerVisible) {
        headerVisible = true;
        setHeader();
      }
    }
  }

  const measureGrid = () => {
    sizes.content = grid.offsetHeight;
    sizes.container = vscroll.clientHeight;
    if (vlerp.getTarget() > maxScroll()) vlerp.jump(maxScroll());
  };
  const gridResizer = new ResizeObserver(measureGrid);
  gridResizer.observe(grid);
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
      if (progress >= 0.8 && !headerVisible && phase !== 'grid') {
        headerVisible = true;
        setHeader();
      }
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
      bar.classList.add('is-solid');
      showIndexes();
      showZoomControls();
    }
  }

  const measureHero = () => {
    heroH = hero.offsetHeight;
    onHeroUpdate(heroLerp.getValue());
  };
  const heroResizer = new ResizeObserver(measureHero);
  heroResizer.observe(hero);
  measureHero();

  // the hero's own entrance: it opens at the full height and settles to 75 % (a long, soft settle)
  const entrance = gsap.timeline();
  entrance.fromTo(hero, { height: window.innerHeight }, { height: window.innerHeight * 0.75, duration: 2.4, delay: 0.9, ease: 'power3.out', onComplete: () => (introPlaying = false) }, 0);
  entrance.fromTo(logoBox, { opacity: 0 }, { opacity: 1, duration: 1.5, ease: 'none', delay: 0.9 }, 0);
  entrance.fromTo(heroLabel.firstElementChild, { opacity: 0, y: -40 }, { opacity: 1, y: 0, duration: 1.4, delay: 1.6, ease: 'power3.out' }, 0);

  // ---- index labels and zoom buttons appear once the grid has taken over ----
  function showIndexes() {
    gsap.to(indexes, { opacity: 1, filter: 'blur(0px)', duration: 0.6, ease: SINE, stagger: 0 });
  }
  function showZoomControls() {
    zoomBox.hidden = false;
    gsap.fromTo(zoomBox, { opacity: 0, filter: 'blur(6px)' }, { opacity: 1, filter: 'blur(0px)', duration: 0.6, ease: SINE });
    updateZoomButtons();
  }
  function updateZoomButtons() {
    zoomIn.disabled = neighbourZoom(zoom, 'in') === null;
    zoomOut.disabled = neighbourZoom(zoom, 'out') === null;
  }

  // ---- zoom ----
  // 'flip': the pictures glide to their new places. 'fade': the ones on screen blur out one after another, the grid is laid out again, they blur back in.
  function changeLevel(level: Level, how: 'flip' | 'fade') {
    if (how === 'flip') {
      const state = Flip.getState(items);
      zoom = level;
      applyLayout(level);
      Flip.from(state, { duration: 1.2, ease: QUART, overwrite: 'auto' });
      updateZoomButtons();
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
        updateZoomButtons();
      },
    });
  }
  const zoomStep = (direction: 'in' | 'out') => {
    const next = neighbourZoom(zoom, direction);
    if (next === null || zooming || !heroDismissed) return;
    changeLevel(next, 'fade');
  };
  const onZoomIn = () => zoomStep('in');
  const onZoomOut = () => zoomStep('out');
  zoomIn.addEventListener('click', onZoomIn);
  zoomOut.addEventListener('click', onZoomOut);

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
    hoverEnters[i] = (e) => finePointer.matches && isDesktop && !lightboxOpen && paper.enter(e, img);
    hoverMoves[i] = (e) => finePointer.matches && isDesktop && paper.move(e, img);
    hoverLeaves[i] = (e) => paper.leave(e, img);
    img.addEventListener('pointerenter', hoverEnters[i]);
    img.addEventListener('pointermove', hoverMoves[i]);
    img.addEventListener('pointerleave', hoverLeaves[i]);
  });

  // ---- the photo opened large ----
  let closing = false;
  let source: HTMLImageElement | undefined;
  const openPicture = (img: HTMLImageElement) => {
    if (lightboxOpen || closing || !heroDismissed) return;
    paper.leave();
    source = img;
    lightboxOpen = true;
    const from = img.getBoundingClientRect();
    boxImg.src = img.dataset.full || img.currentSrc || img.src;
    boxImg.alt = img.alt;
    const labels = boxCaption.querySelectorAll<HTMLElement>('.lg-label');
    labels[0].textContent = `[${img.dataset.id}]`;
    boxCaption.querySelector('strong')!.textContent = img.dataset.title ?? '';
    labels[1].textContent = `${img.dataset.time} — ${img.dataset.credit}`;
    box.hidden = false;
    const play = () => {
      if (!lightboxOpen) return;
      const to = boxImg.getBoundingClientRect();
      gsap.fromTo(
        boxImg,
        { x: from.left + from.width / 2 - (to.left + to.width / 2), y: from.top + from.height / 2 - (to.top + to.height / 2), scale: from.width / to.width },
        { x: 0, y: 0, scale: 1, duration: 1, ease: 'power3.inOut' },
      );
      gsap.fromTo(boxBg, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'power2.out' });
      gsap.fromTo(boxCaption, { opacity: 0, filter: 'blur(6px)' }, { opacity: 1, filter: 'blur(0px)', duration: 0.6, delay: 0.7 });
    };
    // the large file may not be there yet: the grid's own picture stands in until it is (the box measures the image once it has a size)
    if (boxImg.complete && boxImg.naturalWidth) play();
    else boxImg.addEventListener('load', play, { once: true });
  };
  const closePicture = () => {
    if (!lightboxOpen || closing || !source) return;
    closing = true;
    const to = source.getBoundingClientRect();
    const from = boxImg.getBoundingClientRect();
    gsap.to(boxCaption, { opacity: 0, duration: 0.3 });
    gsap.to(boxImg, {
      x: `+=${to.left + to.width / 2 - (from.left + from.width / 2)}`,
      y: `+=${to.top + to.height / 2 - (from.top + from.height / 2)}`,
      scale: (gsap.getProperty(boxImg, 'scale') as number) * (to.width / from.width),
      duration: 0.9,
      ease: 'power3.inOut',
    });
    gsap.to(boxBg, {
      opacity: 0,
      duration: 0.5,
      delay: 0.4,
      onComplete: () => {
        box.hidden = true;
        closing = false;
        lightboxOpen = false;
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
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closePicture();
  };
  document.addEventListener('keydown', onKey);

  // ---- the menu ----
  const menu = initLumenMenu(menuRoot, {
    onOpen: () => {
      menuOpen = true;
      setHeader();
    },
    onClose: () => {
      menuOpen = false;
      setHeader();
    },
  });
  const openMenu = () => {
    if (!heroDismissed && phase === 'hero' && introPlaying) return;
    menu.open();
  };
  openers.forEach((button) => button.addEventListener('click', openMenu));

  // ---- gestures: before the hero is gone they move the hero, afterwards the grid ----
  const stopGestures = scrollGestures({
    enabled: () => !menuOpen && !lightboxOpen,
    shouldHandle: (delta) => (phase === 'grid' ? delta >= 0 || position > 4 : true),
    onDelta: (delta) => {
      if (phase === 'grid') {
        vlerp.setTarget((target) => clamp(target + delta, 0, maxScroll()));
        return;
      }
      if (introPlaying || phase !== 'hero') return;
      heroLerp.setTarget((target) => clamp(target + delta, 0, heroH));
    },
  });

  return () => {
    stopGestures();
    heroLerp.destroy();
    vlerp.destroy();
    revealer?.disconnect();
    gridResizer.disconnect();
    heroResizer.disconnect();
    entrance.kill();
    gsap.killTweensOf([header, hero, logo, logoBox, heroLabel, content, items, indexes, zoomBox, boxImg, boxBg, boxCaption]);
    zoomIn.removeEventListener('click', onZoomIn);
    zoomOut.removeEventListener('click', onZoomOut);
    desktopQuery.removeEventListener('change', onDesktopChange);
    images.forEach((img, i) => {
      img.removeEventListener('pointerenter', hoverEnters[i]);
      img.removeEventListener('pointermove', hoverMoves[i]);
      img.removeEventListener('pointerleave', hoverLeaves[i]);
    });
    items.forEach((item, i) => item.querySelector('.lg-link')?.removeEventListener('click', linkClicks[i]));
    box.removeEventListener('click', closePicture);
    document.removeEventListener('keydown', onKey);
    openers.forEach((button) => button.removeEventListener('click', openMenu));
    paper.destroy();
    menu.destroy();
    disposeLayer('top');
    getLenis()?.start();
    document.documentElement.style.backgroundColor = previousBackground;
  };
}
