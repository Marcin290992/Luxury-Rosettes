// Page transition without the browser's View Transition snapshot.
//
// Why: the snapshot is drawn at the height of the LARGEST window (the phone's address bar hidden), while on a scrolled page the reader
// sees the SMALLER window (bar showing). The card therefore never matched the picture on screen and the page seemed to jump as the bar
// moved. Nothing sized from the snapshot can fix that — so the transition is its own overlay instead: plain DOM in the page's own
// colour, moved with transforms. The address bar has no part in it, so it cannot jump.
//
// Choreography (the same as the old card transition): the page folds away to the lower left, a fresh card swings in from the lower
// right and opens to the full screen. The overlay is painted BEFORE Astro swaps the pages, so the swap itself is never seen.

export type PageTransitionDirection = 'forwards' | 'backwards';

const OUT_MS = 520; // the page folds away (the swap happens under cover)
const IN_MS = 780; // the new card swings in and opens
const EASE_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)';

let overlay: HTMLElement | null = null;
let card: HTMLElement | null = null;

const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function ensureOverlay() {
  // Astro swaps <body> whole on navigation, so the overlay lives on <html>, which survives the swap.
  if (overlay && overlay.isConnected) return;
  overlay = document.createElement('div');
  overlay.className = 'pt-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  card = document.createElement('div');
  card.className = 'pt-card';
  overlay.appendChild(card);
  document.documentElement.appendChild(overlay);
}

/** Paints the cover (the page folding away) and resolves once it has finished, i.e. when the swap can happen unseen. */
export function cover(dir: PageTransitionDirection): Promise<void> {
  if (prefersReduced()) return Promise.resolve();
  ensureOverlay();
  if (!overlay || !card) return Promise.resolve();
  overlay.style.display = 'block';
  // restart the animations from the top
  overlay.classList.remove('is-in', 'is-out');
  void overlay.offsetWidth;
  overlay.classList.add('is-out');
  document.documentElement.dataset.ptDir = dir === 'backwards' ? '-1' : '1';
  return new Promise((resolve) => window.setTimeout(resolve, OUT_MS));
}

/** The new page is under the cover; the card swings in and opens to show it, then the overlay removes itself. */
export function reveal(dir: PageTransitionDirection): Promise<void> {
  if (prefersReduced()) {
    hide();
    return Promise.resolve();
  }
  if (!overlay || !card) return Promise.resolve();
  document.documentElement.dataset.ptDir = dir === 'backwards' ? '-1' : '1';
  overlay.classList.remove('is-out');
  void overlay.offsetWidth;
  overlay.classList.add('is-in');
  return new Promise((resolve) =>
    window.setTimeout(() => {
      hide();
      resolve();
    }, IN_MS),
  );
}

function hide() {
  overlay?.classList.remove('is-in', 'is-out');
  if (overlay) overlay.style.display = 'none';
}
