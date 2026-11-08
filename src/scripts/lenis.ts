import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SMOOTH_WHEEL, SMOOTH_TOUCH } from './settings';
import { scrollBox } from './scroller';

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

  // on touch devices the page scrolls inside #scroll-root (scripts/scroller.ts): Lenis smooths that box instead of the window
  const box = scrollBox();

  // To compare on a real phone: open any page with ?native=1 and the finger scrolls the page natively (the phone's own momentum, Lenis does not take the
  // touch over); ?native=0 puts the smooth finger back. The choice is kept for the session.
  let native = false;
  try {
    const q = new URLSearchParams(location.search).get('native');
    if (q === '1') sessionStorage.setItem('lr-native', '1');
    if (q === '0') sessionStorage.removeItem('lr-native');
    native = sessionStorage.getItem('lr-native') === '1';
  } catch {
    /* no storage: the default */
  }

  lenis = new Lenis({
    ...SMOOTH_WHEEL,
    ...SMOOTH_TOUCH,
    ...(native ? { syncTouch: false } : {}),
    ...(box ? { wrapper: box, content: box } : {}),
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

