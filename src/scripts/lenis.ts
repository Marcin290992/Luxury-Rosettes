import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

let lenis: Lenis | undefined;

export function getLenis() {
  return lenis;
}

// Smooth scroll, driven by GSAP's ticker so ScrollTrigger pins/scrubs stay in sync
export function initLenis() {
  if (lenis || typeof window === 'undefined') return lenis;

  gsap.registerPlugin(ScrollTrigger);

  // duration = how long one wheel notch glides; higher = softer, more "floaty"
  lenis = new Lenis({ duration: 2, wheelMultiplier: 0.85, smoothWheel: true, syncTouch: false, autoRaf: false });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  return lenis;
}
