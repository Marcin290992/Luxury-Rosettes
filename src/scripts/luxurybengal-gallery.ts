// A "Luxury Bengal" gallery page (markup and phases: LuxuryBengalGallery.astro).
// Hero: opens full height and settles to 75 % after 0.9 s. Wheel, swipe or key gestures are caught (the page itself never scrolls) and turned
// into a number, `heroLerp`, which eases towards its target. It pulls the grid up over the hero, shrinks and blurs the wordmark and fades it;
// past halfway the page finishes the move alone, and at 80 % the header appears and the grid switches to zoom level 2 (GSAP Flip).
// Grid: moves inside a box by transform (`vlerp`); the faster it moves the more the whole grid shrinks (to 96 %), springing back at rest.
// A mouse over a photo lifts it like paper (luxurybengal-paper.ts). A click opens the photo large with a FLIP from its place, plus a strip to choose from.
// initLuxuryBengalGallery(root) returns destroy().

import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { QUART, SINE } from './luxurybengal-ease';
import { createLerp, scrollGestures } from './luxurybengal-scroll';
import { placeItem, spacingFor, type Level } from './luxurybengal-grid';
import { initPaperHover } from './luxurybengal-paper';
import { getLenis } from './lenis';
import { transitionDone } from './lifecycle';
import { disposeLayer } from './luxurybengal-layer';
import { createSpiral, type Spiral } from './luxurybengal-spiral';
import { createFlight } from './luxurybengal-arrive';
import { hopSheet, warmSheet, type Hop, type Rect } from './luxurybengal-hop';
import { WEBGL_ENABLED, SMOOTH_WHEEL, SMOOTH_TOUCH } from './settings';

gsap.registerPlugin(Flip);

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

const PHOTO_RADIUS = 10; // px, the rounding of the photos (the CSS of .lg-item img and .lg-box-img says the same)
const CLOSE_FLIGHT = 0.65; // seconds the opened picture takes to fly back to its tile
const SHEET_FLIGHT = 1.15; // seconds the picture takes as a sheet of paper, there and back

export function initLuxuryBengalGallery(root: HTMLElement): () => void {
  const q = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
  const hero = q<HTMLElement>('.lg-hero');
  const heroLabel = q<HTMLElement>('.lg-hero-label');
  const logoBox = q<HTMLElement>('.lg-logo-box');
  const logo = q<HTMLElement>('.lg-logo');
  const content = q<HTMLElement>('.lg-content');
  const vscroll = q<HTMLElement>('.lg-vscroll');
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
    // the two large pictures of the opening are the same size (the proportions of the first one; the second is cropped to it)
    const equal = startGrid && level === 'intro';
    const ratio = Number(images[0]?.getAttribute('width')) / Number(images[0]?.getAttribute('height')) || 4 / 3;
    let sideLeft = s.paddingLeft;
    let sideRight = s.paddingRight;
    if (equal && !isDesktop) {
      // both pictures fit on the screen together (a tablet standing up would otherwise push the second below the fold): the column is only as wide
      // as lets two pictures of this proportion stand one above the other between the pill and the bottom edge
      const maxH = Math.max(140, (window.innerHeight - 124 - s.gapY) / 2);
      const colW = Math.min(window.innerWidth - s.paddingLeft - s.paddingRight, Math.max(maxH * ratio, window.innerWidth * 0.35));
      sideLeft = sideRight = (window.innerWidth - colW) / 2;
      const total = (2 * colW) / ratio + s.gapY;
      paddingTop = Math.max(100, (window.innerHeight - total) / 2);
    }
    [0, 1].forEach((i) => {
      if (!images[i]) return;
      images[i].style.aspectRatio = equal ? String(ratio) : '';
      images[i].style.objectFit = equal ? 'cover' : '';
    });
    grid.style.paddingTop = `${paddingTop}px`;
    grid.style.paddingBottom = `${s.paddingBottom}px`;
    grid.style.paddingLeft = `${sideLeft}px`;
    grid.style.paddingRight = `${sideRight}px`;
    grid.style.gridTemplateColumns = `repeat(${s.cols}, minmax(0, 1fr))`;
    // the two large pictures of the opening on a desktop: the gap grows with the screen, so that the hover growth of a wide picture (3.5 %, which is
    // more than 16 px on a big monitor) and the paper lift never close it
    const wideGap = equal && isDesktop ? Math.round(Math.min(Math.max(window.innerWidth * 0.025, 28), 72)) : 0;
    grid.style.columnGap = `${Math.max(s.gapX, wideGap)}px`;
    grid.style.rowGap = `${Math.max(s.gapY, wideGap)}px`;
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
    if (startGrid && index < 2) return; // the two large pictures are uncovered by a mask (see enterGrid)
    if (firstBatch) {
      const top = item.getBoundingClientRect().top;
      const order = Math.max(0, Math.min(top / window.innerHeight, 1)) * 0.35 + index * 0.015;
      gsap.to(item, { opacity: 1, duration: 0.85, delay: order, ease: SINE, overwrite: 'auto' });
      return;
    }
    gsap.to(item, { opacity: 1, duration: 0.6, delay: Math.min(0.08 * index, 0.2), ease: SINE, overwrite: 'auto' });
  };
  const observeItems = () => {
    revealer?.disconnect();
    revealer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          // on the grid page nothing but the two large pictures shows until they have been uncovered; the rest is let in as the grid forms
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
    lastForScale = v;
    // (no breathing of the grid while it scrolls: scaling a whole grid of pictures on every frame is what kept it from gliding as smoothly as the
    // rest of the site. To bring it back: speed = Math.abs(v - lastForScale), goal = speed < 0.1 ? 1 : 1 - 0.04 * Math.min(speed / 80, 1))
    const goal = 1;
    scale += (goal - scale) * 0.15;
    // only the grid breathes while scrolling, not the footer under it. It breathes around the middle of what is on the screen: around the middle of
    // the whole (very tall) grid the pictures on the screen would slide up and down every time the speed changes, and the scroll would not feel smooth
    grid.style.transformOrigin = `50% ${clamp(v, 0, maxScroll()) + sizes.container / 2}px`;
    grid.style.transform = scale > 0.9995 ? '' : `scale(${scale})`;
    track.style.transform = `translate3d(0, ${-clamp(v, 0, maxScroll())}px, 0)`;
    updateEnding();
  };
  const vlerp = createLerp({ lerpFactor: 0.07, onUpdate: onGridUpdate }); // one continuous glide towards the target (a new glide for every wheel notch stalled for a frame at each one)

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
        changeLevel(2);
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

  // ---- zoom: the pictures glide to their places in another layout ----
  function changeLevel(level: Level) {
    const state = Flip.getState(items);
    zoom = level;
    applyLayout(level);
    Flip.from(state, { duration: 0.95, ease: QUART, overwrite: 'auto' });
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
  let switchHop: Hop | undefined; // the sheet that carries a picture chosen in the strip to the middle
  let fastUntil = 0; // while the person is going quickly (a page was just given up) the next pictures melt in too, no page is turned for each
  let switchId = 0; // counts the switches: a turn that is no longer the latest stops touching the picture
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
  // Another picture (from the strip, keys or wheel): the picture shown melts into the next one, which is laid in the second image first, and only
  // then is the picture under it changed, so there is never a frame without a picture.
  // (The grid moves behind the box so the one the box flies back to on closing is on screen.)
  // The picture melts into another without a cut: the old one stays on the second image and fades while the new one comes in over it. Used when
  // a turn is given up for a later request, and when the box is closed on the way to another picture.
  const crossfadeTo = (asked: HTMLImageElement) => {
    ghost.src = boxImg.currentSrc || boxImg.src;
    Object.assign(ghost.style, { left: boxImg.style.left, top: boxImg.style.top, width: boxImg.style.width, height: boxImg.style.height });
    gsap.set(ghost, { x: 0, y: 0, scale: 1, opacity: 1 });
    gsap.to(ghost, { opacity: 0, duration: 0.3, ease: 'power1.out' });
    if (source) source.style.visibility = '';
    fitBox(asked);
    boxImg.src = asked.currentSrc || asked.src;
    boxImg.alt = asked.alt;
    gsap.set(boxImg, { x: 0, y: 0, scale: 1, opacity: 0 });
    gsap.to(boxImg, { opacity: 1, duration: 0.3, ease: 'power1.out' });
    source = asked;
    asked.style.visibility = 'hidden';
    currentIndex = images.indexOf(asked);
  };
  const select = (index: number) => {
    if (!lightboxOpen || closing || index < 0 || index >= images.length) return;
    if (boxReady && (switching || performance.now() < fastUntil)) {
      // A page is turning and another picture is asked for: the page is not finished (that would show a picture nobody wanted any more, and then jump
      // to the right one). It is given up, and the box melts straight into the latest one.
      if (!switching && index === currentIndex) return;
      fastUntil = performance.now() + 900;
      switchId++;
      switchHop?.kill();
      gsap.killTweensOf([ghost, boxImg]);
      wanted = index;
      navIndex = index;
      markActive(index);
      switching = false;
      const asked = images[index];
      if (asked !== source) {
        const r = asked.getBoundingClientRect();
        vlerp.jump(clamp(position + r.top - (window.innerHeight - r.height) / 2, 0, maxScroll()));
        crossfadeTo(asked);
      } else {
        gsap.set(boxImg, { x: 0, y: 0, scale: 1, opacity: 1 });
        gsap.set(ghost, { opacity: 0 });
        asked.style.visibility = 'hidden';
      }
      window.clearTimeout(upgradeTimer);
      upgradeTimer = window.setTimeout(() => {
        const full = asked.dataset.full;
        if (!full) return;
        const big = new Image();
        big.src = full;
        big.decode().then(
          () => {
            if (lightboxOpen && source === asked && !switching) boxImg.src = full;
          },
          () => {},
        );
      }, 350);
      return;
    }
    if (!boxReady || switching) {
      // the person is going faster than the pictures change (or taps while the photo is still opening): the last one asked for is remembered, shown
      // in the strip at once, and put on the screen as soon as this is done (see finish() and shown())
      wanted = index;
      navIndex = index;
      markActive(index);
      return;
    }
    if (index === currentIndex) return;
    switching = true;
    const mine = ++switchId;
    wanted = index;
    navIndex = index; // the picture on its way: closing now sends this one back to its tile (see closePicture)
    const next = images[index];
    const forward = index > currentIndex;
    markActive(index);
    const finish = () => {
      switching = false;
      if (wanted !== currentIndex) {
        navIndex = wanted;
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
      if (mine !== switchId) return; // given up for a later request
      if (!lightboxOpen || closing) {
        switching = false;
        return;
      }
      const r = next.getBoundingClientRect();
      vlerp.jump(clamp(position + r.top - (window.innerHeight - r.height) / 2, 0, maxScroll()));
      ghost.src = nextSrc;
      const restNext = fitBox(next, ghost); // the second image takes the size and place of the next picture
      try {
        await ghost.decode();
      } catch {
        /* it shows when it is there */
      }
      const land = async () => {
        if (mine !== switchId) return;
        // the box is being closed (or is closed) while the picture melted: nothing may touch the picture now, or it is put back at its resting place in
        // the middle of its flight to the tile, the flight's tween is killed and the picture hangs over the grid for good
        if (!lightboxOpen || closing) {
          switching = false;
          gsap.set(ghost, { opacity: 0 });
          return;
        }
        // the next picture stands in the second image; the shown one takes its place once it has the new picture
        // loaded, and only then the second image goes: there is never a frame with the old one
        gsap.set(ghost, { opacity: 1 });
        gsap.killTweensOf(boxImg);
        // the picture and the tile it belongs to change in one step, so that closing at any moment sends the shown picture to its own tile
        fitBox(next);
        boxImg.src = nextSrc;
        boxImg.alt = next.alt;
        if (source) source.style.visibility = '';
        source = next;
        next.style.visibility = 'hidden';
        currentIndex = index;
        navIndex = wanted; // a later one may have been asked for while this melted (finish() goes on to it)
        try {
          await boxImg.decode();
        } catch {
          /* it shows when it is there */
        }
        if (mine !== switchId) return;
        gsap.set(boxImg, { x: 0, y: 0, scale: 1, opacity: 1 });
        gsap.set(ghost, { opacity: 0 });
        finish();
      };
      if (sheetsOn) {
        // The same entrance as a picture opening from the grid: the picture asked for lifts off its little picture in the strip as a sheet of paper
        // and glides to the middle (the second image takes over under it as it lands), while the shown one fades out under it.
        try {
          const hop = await hopSheet(nextSrc, PHOTO_RADIUS, {
            from: () => thumbs[index].getBoundingClientRect(),
            to: () => restNext,
            duration: SHEET_FLIGHT * 0.9,
            onFirstFrame: () => gsap.to(boxImg, { opacity: 0, duration: 0.5, ease: 'power1.inOut', overwrite: true }),
            onLand: () => void land(),
          });
          if (mine !== switchId || !lightboxOpen || closing) hop.kill();
          else switchHop = hop;
          return;
        } catch {
          /* no sheet: the pictures melt, below */
        }
      }
      // the picture shown melts into the next one (the second image, in the next one's size and place), then the shown one takes its place
      gsap.to(boxImg, { opacity: 0, duration: 0.55, ease: 'power1.inOut' });
      gsap.to(ghost, { opacity: 1, duration: 0.55, ease: 'power1.inOut', onComplete: land });
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
  let openFlight: gsap.core.Tween | undefined;
  // The grid behind an opened picture dissolves tile by tile, from the one that was picked outwards (blur and fade, the page's own way of going out),
  // and comes back the same way when the picture returns. Only tiles that are on the screen and shown are touched.
  let dimmed: HTMLElement[] = [];
  const spread = (item: HTMLElement, from: DOMRect) => {
    const r = item.getBoundingClientRect();
    const d = Math.hypot(r.left + r.width / 2 - (from.left + from.width / 2), r.top + r.height / 2 - (from.top + from.height / 2));
    return Math.min(d / Math.hypot(window.innerWidth, window.innerHeight), 1) * 0.3;
  };
  const dimGrid = (picked: HTMLImageElement, delay: number) => {
    const from = picked.getBoundingClientRect();
    const own = picked.closest<HTMLElement>('.lg-item');
    dimmed = items.filter((item) => {
      const r = item.getBoundingClientRect();
      return item !== own && r.bottom > 0 && r.top < window.innerHeight && Number(getComputedStyle(item).opacity) > 0.5;
    });
    // (on a touch screen only the fade: a blur on a dozen tiles at once is too heavy for a phone's GPU and made the flight stutter)
    dimmed.forEach((item) => gsap.to(item, { opacity: 0, duration: 0.5, delay: delay + spread(item, from), ease: SINE, overwrite: 'auto' }));
  };
  const undimGrid = (home: HTMLImageElement, delay: number) => {
    const from = home.getBoundingClientRect();
    dimmed.forEach((item) => gsap.to(item, { opacity: 1, duration: 0.6, delay: delay + spread(item, from), ease: SINE, overwrite: 'auto' }));
    dimmed = [];
  };
  let openHop: Hop | undefined; // the sheet that carries the picture out of its tile, while it is on its way
  let closeHop: Hop | undefined;
  const openPicture = (img: HTMLImageElement) => {
    if (lightboxOpen || closing || !heroDismissed || !interactive) return;
    paper.dismiss(); // not paper.leave(): a copy that fades out would still hang over the picture that is opening
    source = img;
    lightboxOpen = true;
    currentIndex = images.indexOf(img);
    navIndex = currentIndex;
    wanted = currentIndex;
    markActive(currentIndex, false);
    gsap.set(boxImg, { opacity: 1 });
    // the picture the grid already has (cached, so it is there at once) grows first; the large file is fetched and decoded in the background and
    // takes its place when the move is over (same proportions, so nothing shifts)
    boxImg.src = img.currentSrc || img.src;
    boxImg.alt = img.alt;
    gsap.set(boxImg, { x: 0, y: 0, scale: 1, opacity: 0 }); // placed over its tile by start() below
    gsap.set(boxBg, { opacity: 0 });
    gsap.set(strip, { opacity: 0 });
    gsap.set(boxClose, { opacity: 0 });
    gsap.killTweensOf(thumbs);
    const rest = fitBox(img);
    box.hidden = false;
    // Plain opening (no sheet): the grid stays as it is while the white comes in over it, then the strip and the X fade in.
    const plainFades = () => {
      gsap.set(thumbs, { clearProps: 'opacity,transform,filter' });
      thumbs.forEach((t) => (t.style.transition = ''));
      gsap.to(boxBg, { opacity: 1, duration: 0.55, ease: 'power2.out' });
      gsap.to(strip, { opacity: 1, duration: 0.8, delay: 0.6, ease: 'power1.out' });
      gsap.to(boxClose, { opacity: 1, duration: 0.6, delay: 0.6, ease: 'power1.out' });
    };
    // With the sheet (the times are from the moment it lifts off; it flies for SHEET_FLIGHT): the grid is still there as the sheet leaves its tile,
    // then dissolves behind it, tile by tile from the picture outwards, while the white comes up; the pictures of the strip slide in one after
    // another from the one shown when the sheet is over halfway, and the X comes last, once the picture is down.
    const stage = () => {
      dimGrid(img, 0.12);
      gsap.to(boxBg, { opacity: 1, duration: SHEET_FLIGHT * 0.7, delay: SHEET_FLIGHT * 0.2, ease: 'power1.inOut' });
      const fromSide = window.innerWidth >= 1024;
      gsap.set(strip, { opacity: 1 });
      thumbs.forEach((t, i) => {
        const away = Math.min(Math.abs(i - currentIndex), 9);
        gsap.fromTo(
          t,
          { opacity: 0, x: fromSide ? -26 : 0, y: fromSide ? 0 : 26, filter: 'blur(6px)' },
          {
            opacity: i === currentIndex ? 1 : 0.32,
            x: 0,
            y: 0,
            filter: 'blur(0px)',
            duration: 0.7,
            delay: SHEET_FLIGHT * 0.55 + away * 0.045,
            ease: SINE,
            onComplete: () => {
              gsap.set(t, { clearProps: 'opacity,transform,filter' }); // the stylesheet's own opacities take over again
              t.style.transition = '';
            },
          },
        );
      });
      gsap.to(boxClose, { opacity: 1, duration: 0.5, delay: SHEET_FLIGHT * 0.95, ease: 'power1.out' });
    };
    if (sheetsOn) {
      gsap.set(thumbs, { opacity: 0 });
      thumbs.forEach((t) => (t.style.transition = 'none')); // the stylesheet's own fade would lag behind the tween
    } else plainFades();
    const shown = () => {
      if (!lightboxOpen) return;
      gsap.set(boxImg, { opacity: 1 });
      boxReady = true;
      if (wanted !== currentIndex) {
        // another picture was asked for (a tap in the strip, a swipe) while this one was still opening: it is turned to now
        navIndex = wanted;
        select(wanted);
        return;
      }
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
      if (sheetsOn) {
        // the picture is a sheet of paper (luxurybengal-hop.ts): it lifts off its tile, bends a little and glides to the middle, where the page's own
        // picture takes over in the frame it lands
        try {
          const hop = await hopSheet(img.currentSrc || img.src, PHOTO_RADIUS, {
            from: () => img.getBoundingClientRect(),
            to: () => rest,
            duration: SHEET_FLIGHT,
            onFirstFrame: () => {
              img.style.visibility = 'hidden';
              stage();
            },
            onLand: () => {
              if (!lightboxOpen || closing) return;
              gsap.set(boxImg, { x: 0, y: 0, scale: 1, opacity: 1 });
              shown();
            },
          });
          if (!lightboxOpen || closing) hop.kill();
          else openHop = hop;
          return;
        } catch {
          plainFades(); // no sheet: the picture itself flies, below
        }
      }
      // The closing played backwards: the picture appears on its tile (which gives way to it), lifts off and glides to the middle with the same
      // curve and time as when it flies back. The tile is measured at every frame, so it leaves exactly from where the tile is.
      img.style.visibility = 'hidden';
      const flight = { p: 1 };
      const place = () => {
        const from = img.getBoundingClientRect();
        const scale = 1 + (from.width / rest.width - 1) * flight.p;
        gsap.set(boxImg, {
          x: (from.left + from.width / 2 - (rest.left + rest.width / 2)) * flight.p,
          y: (from.top + from.height / 2 - (rest.top + rest.height / 2)) * flight.p,
          scale,
          borderRadius: PHOTO_RADIUS / scale, // the rounding stays PHOTO_RADIUS px on the screen however much the picture is scaled
          force3D: true,
        });
      };
      place();
      gsap.set(boxImg, { opacity: 1 }); // in the same instant as the tile gives way: the picture is an exact copy of it, so nothing shows between them
      openFlight = gsap.to(flight, {
        p: 0,
        duration: CLOSE_FLIGHT,
        ease: 'power2.inOut',
        onUpdate: place,
        onComplete: () => {
          if (lightboxOpen && !closing) shown();
        },
      });
    };
    void start();
  };
  const closePicture = () => {
    if (!lightboxOpen || closing || !source) return;
    closing = true;
    openFlight?.kill();
    switchHop?.kill();
    boxReady = false;
    switching = false;
    window.clearTimeout(upgradeTimer);
    gsap.killTweensOf([ghost, boxImg]);
    gsap.set(ghost, { opacity: 0 });
    // (with the sheet the picture is left as it is: closed while still opening, it is hidden, and must not pop up at its place before the sheet)
    gsap.set(boxImg, sheetsOn ? { x: 0, y: 0, scale: 1 } : { x: 0, y: 0, scale: 1, opacity: 1 });
    // Closed while another picture was on its way (a picture still falling, a swipe still loading): the picture that was asked for is the one that goes back,
    // to its own tile. Without this the old one, still in the box, flew back to its tile (the picture jumped back and then returned to its place).
    const asked = images[navIndex];
    if (asked && asked !== source) {
      if (sheetsOn) {
        // the sheet carries the asked picture; the box takes its size
        source.style.visibility = '';
        fitBox(asked);
        boxImg.src = asked.currentSrc || asked.src;
        source = asked;
        asked.style.visibility = 'hidden';
        currentIndex = images.indexOf(asked);
      } else crossfadeTo(asked); // not a cut: the old picture melts into the asked one while they fly back together
    }
    const rest = boxImg.getBoundingClientRect(); // where the picture stands now, measured, not remembered
    // the grid stands still while the picture flies, and the tile is on the screen: a tile that is far off (the strip went through many pictures) is
    // brought into view first, so the picture always has a place to land on
    vlerp.jump(vlerp.getValue());
    const seen = source.getBoundingClientRect();
    if (seen.bottom < 0 || seen.top > window.innerHeight) vlerp.jump(clamp(position + seen.top - (window.innerHeight - seen.height) / 2, 0, maxScroll()));
    // everything leaves softly together: the strip and the X fade first, the white thins out over the flight, the picture glides back and, once at
    // its tile, melts into it (no hard swap)
    // the strip and the X may still be coming in (they arrive 0.6 s after the opening begins): that tween would win over the fade-out
    gsap.killTweensOf([strip, boxClose, boxBg]);
    gsap.to([strip, boxClose], { opacity: 0, duration: 0.25, ease: 'power1.out' });
    gsap.to(boxBg, { opacity: 0, duration: 0.55, delay: 0.05, ease: 'power1.inOut' });
    if (sheetsOn) {
      // the picture goes back as the sheet it came as, from where it stands (or, closed while still opening, from where the sheet is now)
      const home = source;
      let start: Rect = { left: rest.left, top: rest.top, width: rest.width, height: rest.height };
      // closed while the sheet is still on its way out: it turns round at once, from where it is. Otherwise the strip and the X leave first.
      const midFlight = !!openHop?.active();
      const lead = midFlight ? 0 : 0.28;
      gsap.killTweensOf([strip, boxClose, boxBg, ...thumbs]);
      gsap.set(strip, { opacity: 1 });
      thumbs.forEach((t) => (t.style.transition = 'none'));
      const fromSide = window.innerWidth >= 1024;
      gsap.to(thumbs, {
        opacity: 0,
        x: fromSide ? -16 : 0,
        y: fromSide ? 0 : 16,
        duration: 0.3,
        ease: 'power1.in',
        stagger: { each: 0.01, from: currentIndex },
        onComplete: () => {
          gsap.set(strip, { opacity: 0 });
          gsap.set(thumbs, { clearProps: 'opacity,transform,filter' });
          thumbs.forEach((t) => (t.style.transition = ''));
        },
      });
      gsap.to(boxClose, { opacity: 0, duration: 0.25, ease: 'power1.out' });
      gsap.to(boxBg, { opacity: 0, duration: SHEET_FLIGHT * 0.7, delay: lead + SHEET_FLIGHT * 0.15, ease: 'power1.inOut' });
      undimGrid(home, lead + 0.1);
      const finish = () => {
        home.style.visibility = '';
        gsap.set(ghost, { x: 0, y: 0, scale: 1, opacity: 0 });
        box.hidden = true;
        closing = false;
        lightboxOpen = false;
      };
      hopSheet(home.currentSrc || home.src, PHOTO_RADIUS, {
        from: () => start,
        to: () => home.getBoundingClientRect(),
        duration: SHEET_FLIGHT,
        delay: lead,
        onFirstFrame: () => {
          if (openHop?.active()) start = { ...openHop.rect() };
          openHop?.kill();
          openHop = undefined;
          gsap.killTweensOf([boxImg, ghost]);
          gsap.set([boxImg, ghost], { opacity: 0 });
        },
        onLand: finish,
      }).then(
        (hop) => (closeHop = hop),
        () => {
          openHop?.kill();
          gsap.set(boxImg, { opacity: 0 });
          finish();
        },
      );
      return;
    }
    // the tile is measured at every frame, so the picture lands exactly on it even if the page moves a little (the address bar, a resize)
    const flight = { p: 0 };
    gsap.to(flight, {
      p: 1,
      duration: CLOSE_FLIGHT,
      ease: 'power2.inOut',
      onUpdate: () => {
        const to = source!.getBoundingClientRect();
        const scale = 1 + (to.width / rest.width - 1) * flight.p;
        gsap.set([boxImg, ghost], { // the second image (the old picture, melting away) flies with it
          x: (to.left + to.width / 2 - (rest.left + rest.width / 2)) * flight.p,
          y: (to.top + to.height / 2 - (rest.top + rest.height / 2)) * flight.p,
          scale,
          borderRadius: PHOTO_RADIUS / scale,
          force3D: true,
        });
      },
      onComplete: () => {
        if (source) source.style.visibility = '';
        gsap.to(boxImg, {
          opacity: 0,
          duration: 0.2,
          ease: 'power1.out',
          onComplete: () => {
            gsap.set(ghost, { x: 0, y: 0, scale: 1, opacity: 0 });
            box.hidden = true;
            closing = false;
            lightboxOpen = false;
          },
        });
      },
    });
  };
  const linkClicks: Array<() => void> = [];
  // The finger (or the pointer) is down a moment before the click: that is when the sheet's shader and the picture are put on the GPU, so the flight
  // that starts with the click does not stutter at its first frame.
  const linkWarms: Array<() => void> = [];
  items.forEach((item, i) => {
    const link = item.querySelector<HTMLElement>('.lg-link')!;
    linkClicks[i] = () => openPicture(images[i]);
    linkWarms[i] = () => {
      if (sheetsOn && interactive && !lightboxOpen) void warmSheet(images[i].currentSrc || images[i].src);
    };
    link.addEventListener('click', linkClicks[i]);
    link.addEventListener('pointerdown', linkWarms[i], { passive: true });
  });
  box.addEventListener('click', closePicture);
  // ---- going through the pictures with the wheel, the swipe or the keys: at once, with no animation (the melt is only for a click on a
  // picture of the strip) ----
  let navIndex = 0; // the picture asked for last (the one shown follows it as fast as it is loaded)
  let navToken = 0;
  let upgradeTimer = 0;
  const jumpTo = (index: number) => {
    if (!lightboxOpen || closing) return;
    const target = ((index % images.length) + images.length) % images.length; // round and round: after the last comes the first
    if (target === navIndex) return;
    navIndex = target;
    markActive(target, false);
    if (!boxReady || switching) {
      wanted = target; // the photo is still opening or a page is turning: this one is shown as soon as that is done (finish() / shown())
      return;
    }
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
      fitBox(next);
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
    if (!lightboxOpen) return;
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
    touchInertia: 1.7, // Lenis' touchInertiaExponent: a flick carries on after the finger lifts
    enabled: () => !lightboxOpen && revealOn,
    onDelta: (delta, kind) => {
      if (phase === 'grid') {
        // at the very top of the grid a further scroll up brings the hero back
        if (delta < 0 && position <= 4 && !startGrid) {
          returnToHero(delta);
          return;
        }
        // a finger drag moves the grid at once (Lenis' syncTouch has no lag while the finger is down); the wheel and the flick after the lift glide
        if (kind === 'touch') vlerp.jump(clamp(vlerp.getValue() + delta, 0, maxScroll()));
        else vlerp.setTarget((target) => clamp(target + delta, 0, maxScroll()), kind);
        return;
      }
      if (introPlaying || phase !== 'hero') return;
      if (kind === 'touch') heroLerp.jump(clamp(heroLerp.getValue() + delta, 0, heroH));
      else heroLerp.setTarget((target) => clamp(target + delta, 0, heroH));
    },
  });

  // the pictures, the numbers, the header and the zoom buttons come in (at once, or when the spiral of the intro lands)
  const sheetsOn = !matchMedia('(prefers-reduced-motion: reduce)').matches && WEBGL_ENABLED;
  const enterGrid = () => {
    if (!startGrid || revealOn) return;
    revealOn = true;
    firstBatch = true;
    observeItems(); // the pictures below blur in as they come into view
    // the two large pictures are uncovered one after the other, then, by itself,
    // the pictures part and the grid forms: the same glide as when the grid came up over the hero
    const glide = () => {
      // (pagesDone stays false while the sheets fly: the observer must not uncover the page's pictures under them)
      glideTimer = window.setTimeout(() => {
        if (!alive) return;
        // The pictures part as sheets again (luxurybengal-arrive.ts): each slides from where it stands to its place in the grid, lifting and bending on the
        // way, and the ones that were below the screen come up from under it, turned over, like the sheets of the intro. The page's own pictures are
        // shown under them as they land.
        const plain = () => {
          pagesDone = true;
          changeLevel(2);
          observeItems(); // now the rest may come in, as the pictures glide to their places
          interactiveTimer = window.setTimeout(() => {
            interactive = true;
            void warmSheet(images[0].currentSrc || images[0].src);
          }, 1300); // the glide takes 0.95 s
        };
        if (!sheetsOn) return plain();
        const flying = images.slice(0, 16);
        // only the two large pictures have been shown so far: the others (even one at the very edge of the screen) come in from below
        const before = flying.map((img, i) => (i < 2 ? img.getBoundingClientRect() : null));
        createFlight(flying, before, PHOTO_RADIUS, { arrive: { duration: 1.2, delay: 0.5, stagger: 0.06, soft: true }, glide: 1.3 }).then(
          (flight) => {
            if (!alive) {
              flight.dispose();
              return;
            }
            folds.push(() => flight.dispose());
            flight.play({
              start: () => {
                zoom = 2;
                applyLayout(2);
                zoomedByHero = true;
                gsap.set([items[0], items[1]], { opacity: 0 }); // the sheets are drawn over them in this very frame
              },
              tile: (i) => {
                gsap.killTweensOf(items[i]);
                gsap.set(items[i], { opacity: 1 });
              },
              done: () => {
                pagesDone = true;
                observeItems(); // the rest (below the screen) blurs in as it is scrolled to
                interactive = true;
                void warmSheet(images[0].currentSrc || images[0].src); // the shader of the sheets is compiled before the first tap
              },
            });
          },
          plain,
        );
      }, 350);
    };
    let turned = 0;
    const landed = (item: HTMLElement) => {
      gsap.set(item, { opacity: 1 });
      if (++turned === 2) glide();
    };
    // The two pictures arrive like the sheets of the intro (luxurybengal-arrive.ts): a sheet of paper turns over, curls flat and lands on its place, and the
    // page's own picture is shown under it in the moment it lands.
    // Without WebGL (or with reduced motion) each is uncovered from the bottom up by a mask with the rounded corners of the photos instead, while the
    // picture inside slowly gives up a little zoom; the second follows the first by a quarter of a second.
    const maskIn = () => items.slice(0, 2).forEach((item, i) => {
      const img = images[i];
      const tl = gsap.timeline({
        delay: 0.25 * i,
        onComplete: () => {
          gsap.set(img, { clearProps: 'transform' }); // the hover transition of the picture works as before
          gsap.set(item, { clearProps: 'clipPath,transform' });
          landed(item);
        },
      });
      tl.set(item, { opacity: 1, clipPath: `inset(100% 0% 0% 0% round ${PHOTO_RADIUS}px)`, y: 44 });
      tl.to(item, { clipPath: `inset(0% 0% 0% 0% round ${PHOTO_RADIUS}px)`, y: 0, duration: 1.7, ease: 'power4.inOut' }, 0);
      tl.fromTo(img, { scale: 1.24 }, { scale: 1, duration: 1.7, ease: 'power3.out' }, 0);
      folds.push(() => tl.kill());
    });
    if (!sheetsOn) maskIn();
    else {
      createFlight(images.slice(0, 2), [null, null], PHOTO_RADIUS, { arrive: { duration: 1.9, delay: 0, stagger: 0.3 }, glide: 1 }).then(
        (arrival) => {
          if (!alive) {
            arrival.dispose();
            return;
          }
          folds.push(() => arrival.dispose());
          arrival.play({ tile: (i) => landed(items[i]) });
        },
        maskIn, // the pictures could not be made into sheets: the mask
      );
    }
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
    items.forEach((item, i) => {
      const link = item.querySelector('.lg-link');
      link?.removeEventListener('click', linkClicks[i]);
      link?.removeEventListener('pointerdown', linkWarms[i]);
    });
    box.removeEventListener('click', closePicture);
    openFlight?.kill();
    openHop?.kill();
    closeHop?.kill();
    switchHop?.kill();
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
