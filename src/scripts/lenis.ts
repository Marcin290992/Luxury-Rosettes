import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SMOOTH_WHEEL, SMOOTH_TOUCH } from './settings';
import { scrollBox } from './scroller';

let lenis: Lenis | undefined;
let tick: ((time: number) => void) | undefined;
let normalizer: { kill: () => void } | undefined;

// TEST SWITCH for the way a finger scrolls (phones, tablets), to compare them on a real device; open any page with ?scroll=...
// and the choice stays for the rest of the visit (sessionStorage); ?scroll=reset puts it back. Remove it once one way is chosen.
//   (none)     Lenis follows the finger (syncTouch, SMOOTH_TOUCH in settings.ts)
//   native     the phone's own scrolling, no smoothing at all
//   normalize  GSAP's normalizeScroll on the scroll box: the page is scrolled by script with a momentum of its own (TOUCH_MOMENTUM)
const TOUCH_MOMENTUM = (self: { velocityY: number }) => Math.min(1.4, Math.abs(self.velocityY) / 2000); // seconds the page glides after the finger lifts (GSAP's default is 2.8)
const touchMode = () => {
  const param = new URLSearchParams(location.search).get('scroll');
  if (param === 'reset') sessionStorage.removeItem('lr-scroll');
  else if (param) sessionStorage.setItem('lr-scroll', param);
  return sessionStorage.getItem('lr-scroll');
};

export function getLenis() {
  return lenis;
}

// Smooth scroll is driven by GSAP's ticker so ScrollTrigger pins/scrubs stay in sync.
export function initLenis() {
  if (lenis || normalizer || typeof window === 'undefined') return lenis;

  gsap.registerPlugin(ScrollTrigger);
  // the mobile address bar sliding in or out changes only the window's height: that must not re-measure every pin and scrub
  ScrollTrigger.config({ ignoreMobileResize: true });

  // on touch devices the page scrolls inside #scroll-root (scripts/scroller.ts): Lenis smooths that box instead of the window
  const box = scrollBox();

  if (box) {
    const mode = touchMode();
    if (mode === 'native') return lenis; // nothing smooths the finger
    if (mode === 'normalize') {
      normalizer = ScrollTrigger.normalizeScroll({ target: box, type: 'touch', momentum: TOUCH_MOMENTUM, allowNestedScroll: true });
      return lenis;
    }
  }

  lenis = new Lenis({
    ...SMOOTH_WHEEL,
    ...SMOOTH_TOUCH,
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
  normalizer?.kill();
  normalizer = undefined;
}

