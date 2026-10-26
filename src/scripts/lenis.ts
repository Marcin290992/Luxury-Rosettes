import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SMOOTH_WHEEL } from './settings';

let lenis: Lenis | undefined;

export function getLenis() {
  return lenis;
}

// Smooth scroll, driven by GSAP's ticker so ScrollTrigger pins/scrubs stay in sync
export function initLenis() {
  if (lenis || typeof window === 'undefined') return lenis;

  gsap.registerPlugin(ScrollTrigger);

  lenis = new Lenis({ ...SMOOTH_WHEEL, smoothWheel: true, syncTouch: false, autoRaf: false });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  return lenis;
}
