// The page transition on phones and tablets (touch): the same card swing as the native View Transition on a desktop, but built from
// plain DOM, so the browser's own snapshot is never involved.
//
// Why: on Android Chrome the native transition shows, for ~130ms between taking the picture of the old page and starting the animation,
// a frame of its own that is drawn one address-bar height too high on a scrolled page (measured on a Pixel, frame by frame). No CSS
// can reach that frame, so the page jumped. Here nothing of that kind exists.
//
// How it works:
//   1. astro:after-preparation (the new page is fetched, the old one is still on screen): the old page is cloned into a card that lies
//      exactly over it (scrolled the same way), so nothing seems to change.
//   2. Astro swaps the pages (the router runs with fallback="swap", no native transition) - hidden under the card.
//   3. astro:after-swap: the new page is cloned into a second card, and the two cards play the swing: the old one shrinks and leaves
//      to the lower left, the new one comes from the lower right and opens to the full screen. The nav pill is the real one, on top.
//   4. The cards are removed; the live page (the same picture) is under them.
// The cards live on <html>, which the router does not replace on a swap.

// The timeline of codegrid's page change (same as page-out-lite / page-in-lite in Layout.astro):
//   old card: shrinks to 85% (0 - 600ms), then slides up and out (600 - 1200ms)
//   new card: waits below the screen (0 - 600ms), slides up at 85% (600 - 1200ms), then grows to 100% (1200 - 1800ms)
const OLD_DURATION = 1200;
const NEW_DURATION = 1800;
const LINEAR = 'linear';
const EASE = 'cubic-bezier(0.86, 0, 0.07, 1)';

const outFrames = (): Keyframe[] => [
  { offset: 0, transform: 'scale(1)', easing: EASE },
  { offset: 0.5, transform: 'scale(0.85)', easing: EASE },
  { offset: 1, transform: 'translateY(-100%) scale(0.85)' },
];
const inFrames = (): Keyframe[] => [
  { offset: 0, transform: 'translateY(100%) scale(0.85)', easing: LINEAR },
  { offset: 1 / 3, transform: 'translateY(100%) scale(0.85)', easing: EASE },
  { offset: 2 / 3, transform: 'translateY(0) scale(0.85)', easing: EASE },
  { offset: 1, transform: 'translateY(0) scale(1)' },
];

import { restoreTarget, restoreNow, settleScrubs } from './scroll-restore';
import { getScrollY, scrollBox } from './scroller';

const root = () => document.documentElement;

/** All the page's CSS as one string, read from the live style sheets (so it can be copied into the old page's card). */
function collectCss(): string {
  let css = '';
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      css += Array.from(sheet.cssRules).map((r) => r.cssText).join(' ');
    } catch {
      /* a sheet from another site (the web font's): its @font-face is already known to the document */
    }
  }
  return css;
}

/**
 * A card that shows the page as it is now: a copy of <body>, scrolled the way the page is scrolled.
 * `isolate`: the copy lives in a shadow root with its own copy of the page's CSS. The router replaces the old page's style sheets on a
 * swap, and a card that is still playing would lose its look; and the old copy must not be found by the new page's scripts either.
 */
function makeCard(isolate: boolean, y = getScrollY()): HTMLElement {
  const card = document.createElement('div');
  card.className = 'pt-card';
  card.setAttribute('aria-hidden', 'true');
  const copy = document.body.cloneNode(true) as HTMLElement;
  copy.querySelector('#main-nav')?.remove(); // the real nav pill stays on top of the cards
  // a canvas is cloned empty: paint what it shows into its copy
  const from = document.body.querySelectorAll('canvas');
  const to = copy.querySelectorAll('canvas');
  from.forEach((c, i) => {
    try {
      to[i]?.getContext('2d')?.drawImage(c, 0, 0);
    } catch {
      /* a WebGL canvas that cannot be read: it stays empty */
    }
  });
  if (isolate) {
    const shadow = card.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = collectCss();
    shadow.append(style, copy);
  } else {
    card.append(copy);
  }
  root().append(card);
  card.scrollTop = y;
  // on touch devices the page scrolls inside #scroll-root: its copy is scrolled the same
  const box = (card.shadowRoot ?? card).querySelector<HTMLElement>('#scroll-root');
  if (box && scrollBox()) box.scrollTop = y;
  return card;
}

const frames = (n: number) =>
  new Promise<void>((resolve) => {
    const step = (left: number) => (left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
    step(n);
  });

/**
 * A card that is READY before anyone sees it: its pictures are decoded and the browser has had frames to paint it. A card shown the moment
 * it is made is painted from nothing - the pictures of the copy are new elements that still have to be decoded - and the page flashed
 * (black or white) before the copy filled in, which is exactly what made it look like a screenshot. The card is on the page from the start,
 * but practically transparent (so it is really painted), and only when it is ready it becomes opaque.
 */
async function prepareCard(isolate: boolean, y?: number, wait = 150, settle = 2): Promise<HTMLElement> {
  const card = makeCard(isolate, y);
  card.style.opacity = '0.01';
  const scope: ParentNode = card.shadowRoot ?? card;
  const pictures = Array.from(scope.querySelectorAll('img'));
  const decoded = Promise.all(pictures.map((img) => img.decode().catch(() => {})));
  await Promise.race([decoded, new Promise((r) => window.setTimeout(r, wait))]);
  await frames(settle);
  return card;
}

/**
 * Resolves when the new page has settled: its height has not changed for a few frames. The components build their pinned sections and
 * ScrollTrigger re-measures the page for a while after the swap (up to a few hundred ms on a phone); a copy taken before that shows another
 * layout than the page will have, and the card would change into something else at the very end.
 */
function pageSettled(): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let last = -1;
    let same = 0;
    const tick = () => {
      restoreNow(); // while it settles, the page is kept at the position it is going to show
      const h = scrollBox()?.scrollHeight ?? document.documentElement.scrollHeight;
      same = h === last ? same + 1 : 0;
      last = h;
      const age = performance.now() - t0;
      if ((same >= 2 && age > 60) || age > 450) {
        settleScrubs(); // the sections stand where this scroll position puts them, not on their way there
        resolve();
      }
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const SOFT = 'cubic-bezier(0.65, 0, 0.35, 1)';

/** The calm variant (?vt=calm, ?vt=cards switches back): no copies of the page, only a dark veil with the logo that fades over the live page. */
const calmOn = () => {
  try {
    return sessionStorage.getItem('lr-vtcalm') === '1';
  } catch {
    return false;
  }
};

function makeVeil(): HTMLElement {
  const veil = document.createElement('div');
  veil.className = 'pt-veil';
  veil.setAttribute('aria-hidden', 'true');
  const src = document.querySelector<HTMLImageElement>('#main-nav .nav-logo img')?.currentSrc;
  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    veil.append(img);
  }
  veil.style.opacity = '0';
  root().append(veil);
  return veil;
}

/**
 * The nav pill lives inside #scroll-root, which is position:fixed and so a stacking context of its own: the cards (z-index on <html>) cover
 * it completely, and the pill used to vanish for the whole transition and pop back at the end ("the menu loads again"). So a still copy of
 * it is put above the cards, and the real one (about to be replaced anyway) is hidden so the two glasses do not add up.
 */
function makeNavCopy(): HTMLElement | null {
  const real = document.getElementById('main-nav');
  if (!real) return null;
  const copy = real.cloneNode(true) as HTMLElement;
  copy.classList.add('pt-nav');
  copy.removeAttribute('id');
  copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  copy.setAttribute('aria-hidden', 'true');
  copy.setAttribute('inert', '');
  copy.style.pointerEvents = 'none';
  root().append(copy);
  real.style.visibility = 'hidden';
  return copy;
}

/** After the swap: the copy takes the look of the new page's pill (scrolled or not), so nothing changes when the real one shows. */
function syncNavCopy() {
  const copy = document.querySelector<HTMLElement>('.pt-nav');
  const real = document.getElementById('main-nav');
  if (!copy || !real) return;
  copy.classList.toggle('is-scrolled', real.classList.contains('is-scrolled'));
}

/** True while the navigation in progress is played by the own cards (so the browser's View Transition must not run for it). */
let ownNav = false;
export const isOwnNavigation = () => ownNav;

/**
 * `shouldRun` is asked at the start of every navigation: false = this one is left to the browser's native transition. (On a phone the
 * native snapshot jumps when the page is scrolled and the address bar is visible; that navigation is played by the cards instead.)
 */
export function setupTouchTransition(shouldRun: () => boolean = () => true) {
  let veil: HTMLElement | null = null;
  let cardOld: HTMLElement | null = null;
  let running = false;

  const clean = () => {
    restoreNow(); // the live page under the cards is where the new card shows it
    document.querySelectorAll('.pt-card, .pt-veil, .pt-nav').forEach((c) => c.remove());
    veil = null;
    root().classList.remove('pt-run');
    cardOld = null;
    running = false;
    ownNav = false;
  };

  document.addEventListener('astro:before-preparation', (e) => {
    clean();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!shouldRun()) return; // this navigation is the browser's
    ownNav = true;
    if (!calmOn()) {
      // cards: the card of the old page is made and made ready while the next page is fetched; the router waits for both (its loader is
      // awaited), and the old page stays on screen, untouched, until the card is ready to take its place
      try {
        const ready = prepareCard(true, undefined, 150, 1);
        const ev = e as Event & { loader: () => Promise<void> };
        const original = ev.loader;
        ev.loader = async () => {
          await original();
          try {
            const card = await ready;
            makeNavCopy(); // above the card, in the same place as the real pill, which it replaces
            // it becomes opaque gradually over the identical page below: whatever the browser has not painted of it yet cannot show as a flash
            await card.animate([{ opacity: 0.01 }, { opacity: 1 }], { duration: 80, easing: 'linear', fill: 'forwards' }).finished.catch(() => {});
            card.style.opacity = '';
            cardOld = card;
            running = true;
          } catch {
            clean();
          }
        };
      } catch {
        clean();
      }
      return;
    }
    // calm: the veil comes down over the live page while the next page is fetched, and the router waits for it (its loader is awaited)
    try {
      const v = makeVeil();
      veil = v;
      running = true;
      const fade = v.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: SOFT, fill: 'forwards' });
      const mark = v.querySelector('img')?.animate([{ opacity: 0, transform: 'scale(0.92)' }, { opacity: 0.95, transform: 'scale(1)' }], {
        duration: 520,
        delay: 140,
        easing: SOFT,
        fill: 'both',
      });
      const ev = e as Event & { loader: () => Promise<void> };
      const original = ev.loader;
      ev.loader = async () => {
        await Promise.all([original(), fade.finished, mark?.finished]);
      };
    } catch {
      clean();
    }
  });

  document.addEventListener('astro:after-swap', () => {
    if (calmOn() && running && veil) {
      // calm: the new page is built under the veil, put where it belongs, and when it has settled the veil lifts - the page is the live one
      const v = veil;
      const safety = window.setTimeout(clean, 5000);
      Promise.all([pageSettled(), new Promise((r) => window.setTimeout(r, 260))]).then(() => {
        restoreNow();
        settleScrubs();
        const lift = v.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 760, easing: SOFT, fill: 'forwards' });
        lift.finished.then(
          () => {
            window.clearTimeout(safety);
            clean();
          },
          () => clean(),
        );
      });
      return;
    }
    if (!running || !cardOld) return;
    const oldCard = cardOld;
    // the router rewrites <html>'s attributes on a swap: the class that hides the live page is set again here
    root().classList.add('pt-run');
    syncNavCopy();
    const safety = window.setTimeout(clean, NEW_DURATION + 4000);
    // the card of the new page is copied once the page has settled (the old card covers everything meanwhile)
    pageSettled().then(async () => {
      try {
        const newCard = await prepareCard(false, restoreTarget() || getScrollY(), 150, 1);
        newCard.style.opacity = '';
        const out = oldCard.animate(outFrames(), { duration: OLD_DURATION, easing: LINEAR, fill: 'both' });
        const into = newCard.animate(inFrames(), { duration: NEW_DURATION, easing: LINEAR, fill: 'both' });
        Promise.allSettled([out.finished, into.finished]).then(() => {
          window.clearTimeout(safety);
          clean();
        });
      } catch {
        window.clearTimeout(safety);
        clean();
      }
    });
  });

  // a navigation that ends without a swap (an error, the same page) must not leave a card over the page
  document.addEventListener('astro:page-load', () => {
    if (!running) clean();
  });
}
