// Line reveal: the text is split into lines and every line rises out of its own mask when the text scrolls into view.
// One module for every heading and paragraph that should arrive this way, so they all move the same (see settings.ts).
// initLineReveal(elements) is `init` and returns destroy(), which puts the text back as it was (see lifecycle.ts).

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { LINE_REVEAL } from './settings';

gsap.registerPlugin(ScrollTrigger, SplitText);

export function initLineReveal(elements: HTMLElement[], o = LINE_REVEAL, delay = 0) {
  // with reduced motion the text is left alone
  const mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    elements.forEach((el) => {
      SplitText.create(el, {
        type: 'lines',
        mask: 'lines',
        autoSplit: true, // splits again when the width (and so the lines) change
        onSplit: (self) =>
          gsap.from(self.lines, {
            yPercent: 110,
            duration: o.duration,
            stagger: o.stagger,
            delay, // e.g. the length of a page transition, so the text arrives after the page
            ease: o.ease,
            scrollTrigger: { trigger: el, start: o.start, toggleActions: 'play none none reverse' },
          }),
      });
    });
  });
  return () => mm.revert();
}
