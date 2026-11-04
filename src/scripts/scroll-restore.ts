// Going back to a page puts the reader where they were.
//
// The router restores the scroll position right after it swaps the pages - while the page is still short: its pinned sections (their
// spacers) are only built afterwards by the components' setup. ScrollTrigger then re-measures the page, which has become much longer, and
// moves the scroll to the same PROPORTIONAL place (on the home page a position of 4200 became 9324, 6500 became 16620). So after the swap the
// position the router saved is put back, again and again until the page has settled, and it stops the moment the reader touches the page.

import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { getLenis } from './lenis';

let target = 0;
let watching = false;
const timers: number[] = [];

/** Where the page being shown is supposed to be scrolled to (0 for a page reached by a link). */
export const restoreTarget = () => target;

function stop() {
  watching = false;
  timers.splice(0).forEach((t) => window.clearTimeout(t));
}

/**
 * The scrubbed sections follow the scroll with a delay (their `scrub` smoothing, about a second). After the scroll has been put somewhere
 * they would still be on their way there, and a copy of the page, or the first look at it, would show the sections in an earlier state.
 * So the smoothing tweens are finished at once: every pinned or scrubbed section stands exactly where this scroll position puts it.
 */
export function settleScrubs() {
  try {
    ScrollTrigger.update();
    ScrollTrigger.getAll().forEach((st) => st.getTween?.()?.progress(1));
  } catch {
    /* ScrollTrigger is not there (a page without scenes) */
  }
}

/** Puts the page at the saved position now (if it is somewhere else). */
export function restoreNow() {
  if (!target || Math.abs(window.scrollY - target) < 2) return;
  const lenis = getLenis();
  if (lenis) lenis.scrollTo(target, { immediate: true, force: true });
  else window.scrollTo(0, target);
  settleScrubs();
}

export function setupScrollRestore() {
  // the reader scrolling by hand ends it
  for (const ev of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) {
    window.addEventListener(ev, stop, { passive: true, capture: true });
  }

  document.addEventListener('astro:before-preparation', stop);
  document.addEventListener('astro:after-swap', () => {
    stop();
    // the router saved the position in the history entry it came back to (a page reached by a link has 0 there)
    const saved = Number((history.state as { scrollY?: number } | null)?.scrollY ?? 0);
    target = Number.isFinite(saved) && saved > 0 ? saved : 0;
    if (!target) return;
    watching = true;
    // the setup of the components and ScrollTrigger's re-measuring happen in the next frames and up to about a second later
    for (const ms of [0, 40, 100, 200, 350, 550, 800, 1100, 1500, 2000]) {
      timers.push(
        window.setTimeout(() => {
          if (watching) restoreNow();
        }, ms),
      );
    }
  });
}
