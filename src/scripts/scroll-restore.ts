// Going back returns the reader to the SECTION they left (and the place inside it), not to a pixel position.
//
// Why not the pixels: the router restores the scroll position right after it swaps the pages - while the page is still short: its pinned
// sections (their spacers) are only built afterwards by the components' setup. ScrollTrigger then re-measures the page, which has become much
// longer, and moves the scroll to the same PROPORTIONAL place (on the home page a position of 4200 became 9324, 6500 became 16620). So the
// saved pixels are useless. What survives the page being built is "which section, and how far through it": on leaving, the section at the top
// of the screen is saved with the fraction of it that has been scrolled past; on coming back the same section is looked up once the page has
// been built and the scroll is put at the same fraction of it. The scroll is put there again and again until the page has settled (the
// sections change size while the pins and the pictures arrive), and it stops the moment the reader touches the page.
//
// Going to a page any other way (a link, the menu) still opens it at its top (the hero). A link to an #anchor keeps the browser's own behaviour.

import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { getLenis } from './lenis';
import { getScrollY, scrollBox, setScrollY } from './scroller';

type Saved = { k: string; f: number }; // the section's key and the fraction of it that was above the top of the screen

let wanted: Saved | null = null; // where this page is to be put (null: its top)
let comingBack = false; // the navigation that is under way is a step in the history
let watching = false;
const timers: number[] = [];

function stop() {
  watching = false;
  timers.splice(0).forEach((t) => window.clearTimeout(t));
}

/**
 * The scrubbed sections follow the scroll with a delay (their `scrub` smoothing, about a second). After the scroll has been put somewhere
 * they would still be on their way there, and a copy of the page, or the first look at it, would show the sections in an earlier state.
 * So the smoothing tweens are finished at once: every pinned or scrubbed section stands exactly where this scroll position puts it.
 */
function settleScrubs() {
  try {
    ScrollTrigger.update();
    ScrollTrigger.getAll().forEach((st) => st.getTween?.()?.progress(1));
  } catch {
    /* ScrollTrigger is not there (a page without scenes) */
  }
}

// ---- the sections of a page ------------------------------------------------------------------------------------------------------------
// The direct children of #scroll-root (a <main> stands for its own children), in document order. A pinned section is wrapped in a spacer by
// ScrollTrigger: the spacer is what is measured (it holds the whole length of the pin), and the section inside it gives the key, so the key is the
// same before and after the spacer is built.
const SKIP = new Set(['NAV', 'SCRIPT', 'STYLE', 'LINK', 'TEMPLATE']);

function sections(): { el: HTMLElement; key: string }[] {
  const root = document.querySelector<HTMLElement>('#scroll-root');
  if (!root) return [];
  const found: HTMLElement[] = [];
  const add = (el: Element) => {
    if (!(el instanceof HTMLElement) || SKIP.has(el.tagName) || el.classList.contains('preloader')) return;
    if (el.tagName === 'MAIN') {
      Array.from(el.children).forEach(add);
      return;
    }
    found.push(el);
  };
  Array.from(root.children).forEach(add);
  const seen: Record<string, number> = {};
  return found.map((el) => {
    const inner = el.classList.contains('pin-spacer') ? ((el.firstElementChild as HTMLElement | null) ?? el) : el;
    const base = `${inner.tagName.toLowerCase()}.${inner.id || inner.classList[0] || ''}`;
    seen[base] = (seen[base] ?? 0) + 1; // the same kind of section twice on a page (our cats): the second one is #2
    return { el, key: `${base}#${seen[base]}` };
  });
}

/** Where a section starts, and how tall it is, in the scroll's own coordinates (the window's, or the box's on a phone or a tablet). */
function measure(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const box = scrollBox();
  const base = box ? box.getBoundingClientRect().top : 0;
  return { top: r.top - base + getScrollY(), height: r.height };
}

// ---- saving and finding the place ------------------------------------------------------------------------------------------------------
// Each entry of the history has an index (the router keeps it in history.state). The entry of the page that is on the screen is remembered here:
// when a step back begins, history.state already belongs to the page that is being gone TO, so it cannot name the page that is being left.
const indexNow = () => (history.state as { index?: number } | null)?.index;
let shownIndex = indexNow();
const keyFor = (index: number | undefined) => (typeof index === 'number' ? `lr-pos:${index}` : null);

/** On leaving a page: which section is at the top of the screen, and how far through it the reader is. */
function savePosition() {
  const key = keyFor(shownIndex); // the page that is being left
  if (!key) return;
  try {
    const y = getScrollY();
    let here: Saved | null = null;
    for (const { el, key: k } of sections()) {
      const m = measure(el);
      if (m.height <= 0) continue;
      if (m.top <= y + 1) here = { k, f: Math.min(1, Math.max(0, (y - m.top) / m.height)) };
    }
    if (here) sessionStorage.setItem(key, JSON.stringify(here));
    else sessionStorage.removeItem(key);
  } catch {
    /* storage is not available (a private window): the page then opens at its top */
  }
}

function savedPosition(): Saved | null {
  const key = keyFor(indexNow()); // the page that has just come in
  if (!key) return null;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

/** The scroll position that puts the page at the saved place now (null: the section is not there yet, the page is still being built). */
function targetNow(): number | null {
  if (!wanted) return 0;
  const hit = sections().find((s) => s.key === wanted!.k);
  if (!hit) return null;
  const m = measure(hit.el);
  return m.top + wanted.f * m.height;
}

/** Puts the page at the wanted place now, if it is somewhere else. */
function restoreNow() {
  if (!watching) return;
  const target = targetNow();
  if (target === null || Math.abs(getScrollY() - target) < 2) return;
  const lenis = getLenis();
  if (lenis) lenis.scrollTo(target, { immediate: true, force: true });
  else setScrollY(target);
  settleScrubs();
}

export function setupScrollRestore() {
  // the reader scrolling by hand ends it
  for (const ev of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) {
    window.addEventListener(ev, stop, { passive: true, capture: true });
  }

  document.addEventListener('astro:before-preparation', (event) => {
    // the page that is being left: where the reader is on it (a step back to it will put them there again)
    savePosition();
    comingBack = (event as unknown as { navigationType?: string }).navigationType === 'traverse';
    stop();
  });
  document.addEventListener('astro:after-swap', () => {
    stop();
    // A step in the history (back, or forward) puts the reader at the section they left, if it was saved; any other way in opens the page at its
    // top (the hero). The router puts its own saved position back right after the swap, so the wanted place is forced again and again until
    // the page has settled. A link to an #anchor keeps the browser's own behaviour.
    wanted = comingBack ? savedPosition() : null;
    comingBack = false;
    shownIndex = indexNow();
    if (location.hash) return;
    watching = true;
    // the setup of the components and ScrollTrigger's re-measuring happen in the next frames and up to about a second later
    for (const ms of [0, 40, 100, 200, 350, 550, 800, 1100, 1500, 2000, 3000]) {
      timers.push(
        window.setTimeout(() => {
          if (watching) restoreNow();
        }, ms),
      );
    }
  });
}
