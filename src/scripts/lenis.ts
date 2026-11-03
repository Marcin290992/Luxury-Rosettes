import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SMOOTH_WHEEL, SMOOTH_TOUCH } from './settings';

let lenis: Lenis | undefined;
let tick: ((time: number) => void) | undefined;

export function getLenis() {
  return lenis;
}

// Smooth scroll, driven by GSAP's ticker so ScrollTrigger pins/scrubs stay in sync
export function initLenis() {
  if (lenis || typeof window === 'undefined') return lenis;

  // A test switch: open any page with ?nolenis=1 and the smooth scroll stays off for the visit (?nolenis=0 turns it back on).
  // It is for telling whether a jump at a page transition has to do with Lenis or not.
  try {
    const q = new URLSearchParams(location.search).get('nolenis');
    if (q === '1') sessionStorage.setItem('lrnolenis', '1');
    if (q === '0') sessionStorage.removeItem('lrnolenis');
    if (sessionStorage.getItem('lrnolenis') === '1') return lenis;
  } catch {
    /* ignore */
  }

  gsap.registerPlugin(ScrollTrigger);
  // the mobile address bar sliding in or out changes only the window's height: that must not re-measure every pin and scrub
  // (it made the scenes jump, e.g. at the start of a page transition)
  ScrollTrigger.config({ ignoreMobileResize: true });

  lenis = new Lenis({ ...SMOOTH_WHEEL, ...SMOOTH_TOUCH, smoothWheel: true, autoRaf: false });
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
