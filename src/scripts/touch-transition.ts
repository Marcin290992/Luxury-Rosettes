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

const DURATION = 1100;
const LINEAR = 'linear';
const EASE_IN = 'cubic-bezier(0.65, 0, 1, 1)';
const EASE_OUT = 'cubic-bezier(0, 0, 0.35, 1)';
const EASE_IO = 'cubic-bezier(0.76, 0, 0.24, 1)';

const tf = (x: number, y: number, rot: number, scale: number, d: number) =>
  `translate(${x * d}%, ${y}%) rotate(${rot * d}deg) scale(${scale})`;

// the same keyframes as page-out-lite / page-in-lite in Layout.astro (d = 1 forwards, -1 back)
const outFrames = (d: number): Keyframe[] => [
  { offset: 0, transform: tf(0, 0, 0, 1, d), easing: EASE_IN },
  { offset: 0.25, transform: tf(0, 0, 0, 0.6, d), easing: EASE_IN },
  { offset: 0.4, transform: tf(-45, 8, -14, 0.6, d), easing: LINEAR },
  { offset: 0.55, transform: tf(-115, 40, -30, 0.6, d) },
  { offset: 1, transform: tf(-115, 40, -30, 0.6, d) },
];
const inFrames = (d: number): Keyframe[] => [
  { offset: 0, transform: tf(115, 40, 30, 0.6, d), easing: LINEAR },
  { offset: 0.25, transform: tf(115, 40, 30, 0.6, d), easing: LINEAR },
  { offset: 0.4, transform: tf(45, 8, 14, 0.6, d), easing: EASE_OUT },
  { offset: 0.55, transform: tf(0, 0, 0, 0.6, d), easing: LINEAR },
  { offset: 0.66, transform: tf(0, 0, 0, 0.6, d), easing: EASE_IO },
  { offset: 1, transform: tf(0, 0, 0, 1, d) },
];

import { restoreTarget, restoreNow, settleScrubs } from './scroll-restore';

const root = () => document.documentElement;

/** All the page's CSS as one string, read from the live style sheets (so it can be copied into the old page's card). */
function collectCss(): string {
  if (cssCache !== null) return cssCache;
  let css = '';
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      css += Array.from(sheet.cssRules).map((r) => r.cssText).join(' ');
    } catch {
      /* a sheet from another site (the web font's): its @font-face is already known to the document */
    }
  }
  cssCache = css;
  return css;
}

/** The page's CSS is collected once per page, in an idle moment after it has loaded, so starting a transition does not pay for it. */
let cssCache: string | null = null;
function warmCss() {
  const run = () => {
    if (cssCache === null) collectCss();
  };
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric.call(window, run, { timeout: 2000 });
  else window.setTimeout(run, 1200);
}

/**
 * A card that shows the page as it is now: a copy of <body>, scrolled the way the page is scrolled.
 * `isolate`: the copy lives in a shadow root with its own copy of the page's CSS. The router replaces the old page's style sheets on a
 * swap, and a card that is still playing would lose its look; and the old copy must not be found by the new page's scripts either.
 */
function makeCard(isolate: boolean, y = window.scrollY): HTMLElement {
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
async function prepareCard(isolate: boolean, y?: number): Promise<HTMLElement> {
  const card = makeCard(isolate, y);
  card.style.opacity = '0.01';
  const scope: ParentNode = card.shadowRoot ?? card;
  const pictures = Array.from(scope.querySelectorAll('img'));
  const decoded = Promise.all(pictures.map((img) => img.decode().catch(() => {})));
  await Promise.race([decoded, new Promise((r) => window.setTimeout(r, 500))]);
  await frames(3);
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
      const h = document.documentElement.scrollHeight;
      same = h === last ? same + 1 : 0;
      last = h;
      const age = performance.now() - t0;
      if ((same >= 3 && age > 120) || age > 700) {
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

export function setupTouchTransition() {
  let dir = 1;
  let veil: HTMLElement | null = null;
  let cardOld: HTMLElement | null = null;
  let running = false;

  const clean = () => {
    restoreNow(); // the live page under the cards is where the new card shows it
    document.querySelectorAll('.pt-card, .pt-veil').forEach((c) => c.remove());
    veil = null;
    root().classList.remove('pt-run');
    cardOld = null;
    running = false;
  };

  document.addEventListener('astro:before-preparation', (e) => {
    clean();
    dir = (e as Event & { direction?: string }).direction === 'back' ? -1 : 1;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!calmOn()) {
      // cards: the card of the old page is made and made ready while the next page is fetched; the router waits for both (its loader is
      // awaited), and the old page stays on screen, untouched, until the card is ready to take its place
      try {
        const ready = prepareCard(true);
        const ev = e as Event & { loader: () => Promise<void> };
        const original = ev.loader;
        ev.loader = async () => {
          await original();
          try {
            const card = await ready;
            // it becomes opaque gradually over the identical page below: whatever the browser has not painted of it yet cannot show as a flash
            await card.animate([{ opacity: 0.01 }, { opacity: 1 }], { duration: 160, easing: 'linear', fill: 'forwards' }).finished.catch(() => {});
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
    cssCache = null; // the new page has its own style sheets
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
    const safety = window.setTimeout(clean, DURATION + 4000);
    // the card of the new page is copied once the page has settled (the old card covers everything meanwhile)
    pageSettled().then(async () => {
      try {
        const newCard = await prepareCard(false, restoreTarget() || window.scrollY);
        newCard.style.opacity = '';
        const out = oldCard.animate(outFrames(dir), { duration: DURATION, easing: LINEAR, fill: 'both' });
        const into = newCard.animate(inFrames(dir), { duration: DURATION, easing: LINEAR, fill: 'both' });
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
  warmCss();
  document.addEventListener('astro:page-load', () => {
    warmCss();
    if (!running) clean();
  });
}
