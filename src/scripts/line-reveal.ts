// Line reveal: the text is split into lines and every line rises out of its own mask when the text scrolls into view.
// One module for every heading and paragraph that should arrive this way, so they all move the same (see settings.ts).
// initLineReveal(elements) is `init` and returns destroy(), which puts the text back as it was (see lifecycle.ts).

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { LINE_REVEAL } from './settings';
import './house-ease'; // registers the site's curve (LINE_REVEAL.ease)

gsap.registerPlugin(ScrollTrigger, SplitText);

export function initLineReveal(elements: HTMLElement[], o = LINE_REVEAL, delay = 0) {
  // with reduced motion the text is left alone
  const mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    elements.forEach((el) => {
      // a big title (data-char-reveal) rises letter by letter out of its lines; everything else line by line
      const chars = 'charReveal' in el.dataset;
      SplitText.create(el, {
        type: chars ? 'lines,chars' : 'lines',
        mask: 'lines',
        autoSplit: true, // splits again when the width (and so the lines) change
        onSplit: (self) =>
          gsap.from(chars ? self.chars : self.lines, {
            yPercent: 110,
            duration: chars ? o.char.duration : o.duration,
            stagger: chars ? o.char.stagger : o.stagger,
            delay, // e.g. the length of a page transition, so the text arrives after the page
            ease: o.ease,
            scrollTrigger: { trigger: el, start: o.start, toggleActions: 'play none none reverse' },
          }),
      });
    });
  });
  return () => mm.revert();
}
