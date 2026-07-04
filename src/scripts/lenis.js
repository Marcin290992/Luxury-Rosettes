import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

let lenisInstance;
let tickerCallback;

export function getLenis() {
  return lenisInstance;
}

export function initLenis() {
  if (lenisInstance || typeof window === 'undefined') {
    return lenisInstance;
  }

  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  gsap.registerPlugin(ScrollTrigger);

  lenisInstance = new Lenis({
    duration: 1.2,
    wheelMultiplier: 0.6,
    touchMultiplier: 1,
    smoothWheel: true,
    syncTouch: false,
    autoRaf: false,
  });

  // Podpinamy ScrollTrigger.refresh() na resize i Lenis scroll (tylko do odświeżenia, NIE do update)
  lenisInstance.on('scroll', ScrollTrigger.update);

  tickerCallback = (time) => {
    lenisInstance?.raf(time * 1000);
  };
  gsap.ticker.add(tickerCallback);

  // Włącz lagSmoothing z niskim progiem – zapobiega mikro-zacinkom
  gsap.ticker.lagSmoothing(33, 16);

  return lenisInstance;
}

export function destroyLenis() {
  if (tickerCallback) {
    gsap.ticker.remove(tickerCallback);
    tickerCallback = undefined;
  }
  if (lenisInstance) {
    lenisInstance.off('scroll', ScrollTrigger.update);
    lenisInstance.destroy();
    lenisInstance = undefined;
  }
}
