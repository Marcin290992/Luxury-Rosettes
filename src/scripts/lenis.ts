import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SMOOTH_WHEEL, SMOOTH_TOUCH } from './settings';

let lenis: Lenis | undefined;
let tick: ((time: number) => void) | undefined;

export function getLenis() {
  return lenis;
}

// Smooth scroll is driven by GSAP's ticker so ScrollTrigger pins/scrubs stay in sync.
export function initLenis() {
  if (lenis || typeof window === 'undefined') return lenis;

  gsap.registerPlugin(ScrollTrigger);
  // the mobile address bar sliding in or out changes only the window's height: that must not re-measure every pin and scrub
  ScrollTrigger.config({ ignoreMobileResize: true });

  lenis = new Lenis({
    ...SMOOTH_WHEEL,
    ...SMOOTH_TOUCH,
    smoothWheel: true,
    autoRaf: false,
    stopInertiaOnNavigate: true,
  });
  lenis.on('scroll', ScrollTrigger.update);
  tick = (time) => lenis?.raf(time * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);

  return lenis;
}

/** Stops the smooth scroll and its ticker (the page is being swapped out). */
export function destroyLenis() {
  if (tick) gsap.ticker.remove(tick);
  lenis?.destroy();
  lenis = undefined;
  tick = undefined;
}

/**
 * Freezes the smooth scroll for a page transition WITHOUT touching <html>: the ticker is removed (no more programmatic
 * window.scrollTo while the browser captures the snapshot), but the `lenis`/`lenis-smooth` classes stay on <html>.
 *
 * destroy() in the middle of the capture (astro:after-preparation) runs cleanUpClassName(), which strips those classes from
 * <html> and, with `html.lenis, html.lenis body { height: auto }`, changes the document's height right as the snapshot is taken.
 * Freezing here keeps <html> byte-for-byte as it was when the user stopped scrolling, which is what the snapshot must match.
 */
export function freezeLenis() {
  // removing the ticker stops lenis.raf(), so no more programmatic window.scrollTo happens during the capture. `lenis` and its
  // `lenis`/`lenis-smooth` classes on <html> stay exactly as they are (reset() is private in Lenis's typings and is not needed here:
  // with no raf the in-flight lerp simply stops).
  if (tick) gsap.ticker.remove(tick);
  tick = undefined;
}

