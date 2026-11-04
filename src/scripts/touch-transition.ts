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
function makeCard(isolate: boolean): HTMLElement {
  const y = window.scrollY;
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

export function setupTouchTransition() {
  let dir = 1;
  let cardOld: HTMLElement | null = null;
  let running = false;

  const clean = () => {
    document.querySelectorAll('.pt-card').forEach((c) => c.remove());
    root().classList.remove('pt-run');
    cardOld = null;
    running = false;
  };

  document.addEventListener('astro:before-preparation', (e) => {
    clean();
    dir = (e as Event & { direction?: string }).direction === 'back' ? -1 : 1;
  });

  document.addEventListener('astro:after-preparation', () => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    try {
      cardOld = makeCard(true);
      running = true;
    } catch {
      clean();
    }
  });

  document.addEventListener('astro:after-swap', () => {
    if (!running || !cardOld) return;
    const oldCard = cardOld;
    // the router rewrites <html>'s attributes on a swap: the class that hides the live page is set again here
    root().classList.add('pt-run');
    const safety = window.setTimeout(clean, DURATION + 3000);
    // two frames: the new page has been built and laid out, so the copy is what the page will show
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        try {
          const newCard = makeCard(false);
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
      }),
    );
  });

  // a navigation that ends without a swap (an error, the same page) must not leave a card over the page
  document.addEventListener('astro:page-load', () => {
    if (!running) clean();
  });
}
