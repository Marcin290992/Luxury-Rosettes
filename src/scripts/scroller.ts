// Where the page scrolls.
//
// On a phone or a tablet (touch) the page does not scroll the document but a full-screen box, #scroll-root (see Layout.astro), as in
// codegrid's demo (its .projects box). The document itself never scrolls, so the browser's address bar never slides in or out and the
// window never changes its height: the page transition's snapshot has nothing to jump against (on Chrome Android it was drawn one
// address-bar height too high on a scrolled page), and Safari on iOS keeps its toolbars still.
// On a laptop or a desktop nothing changes: the window scrolls (and Lenis smooths it).

import { ScrollTrigger } from 'gsap/ScrollTrigger';

export const SCROLL_ROOT = '#scroll-root';

export const innerScroll = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

if (typeof window !== 'undefined' && innerScroll()) {
  // The element itself, not its selector: a trigger made inside gsap.context() looks selectors up only within the context's scope, and
  // #scroll-root is outside it. The router builds a new #scroll-root with every page, so the default is set again right after each swap
  // (this listener is registered before any component's own, which build their triggers on the same event).
  // The pins are "fixed": the box fills the whole screen, so a fixed pin sits where the window's own pin would.
  const apply = () => {
    const box = document.querySelector<HTMLElement>(SCROLL_ROOT);
    if (box) ScrollTrigger.defaults({ scroller: box, pinType: 'fixed' });
  };
  apply();
  document.addEventListener('astro:after-swap', apply);
}

export const scrollBox = () => (innerScroll() ? document.querySelector<HTMLElement>(SCROLL_ROOT) : null);

/** How far the page is scrolled. */
export const getScrollY = () => scrollBox()?.scrollTop ?? window.scrollY;

/** Puts the page at `y` at once. */
export function setScrollY(y: number) {
  const box = scrollBox();
  if (box) box.scrollTop = y;
  else window.scrollTo(0, y);
}

/** Calls `fn` whenever the page scrolls (a box's scroll event does not reach `window`, but it can be caught on the way down). */
export function onPageScroll(fn: () => void) {
  window.addEventListener('scroll', fn, { passive: true, capture: true });
  return () => window.removeEventListener('scroll', fn, { capture: true } as EventListenerOptions);
}
