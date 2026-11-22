// Close-to: the words of a heading start far apart and slide together while the picture between the two lines below opens, on one scrubbed
// timeline. After the 71three "Close to the work" section.
// The end state is the CSS (words together, picture open), so without the script or with reduced motion that is what you see; the script
// reads those values and plays the way to them. Three sizes (phone, tablet, desktop) via gsap.matchMedia (settings.ts CLOSE_TO).
// initCloseTo(root) returns destroy(). Markup: CloseTo.astro.

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CLOSE_TO } from './settings';

gsap.registerPlugin(ScrollTrigger);

export function initCloseTo(root: HTMLElement, o = CLOSE_TO): () => void {
  const words = root.querySelector<HTMLElement>('.ct-words');
  const media = root.querySelector<HTMLElement>('.ct-media');
  if (!words || !media) return () => {};

  const mm = gsap.matchMedia();
  const play = (cfg: { gapFrom: number; start: string; scrub: number; mediaAt: number }) => {
    // the end state, as the CSS has it for this size (read before anything is set)
    const gapTo = getComputedStyle(words).columnGap;
    const box = media.getBoundingClientRect();
    gsap.set(words, { columnGap: `${cfg.gapFrom}vw` });
    gsap.set(media, { width: 0, height: 0 });
    gsap
      .timeline({
        scrollTrigger: { trigger: root, start: cfg.start, end: 'bottom 100%', scrub: cfg.scrub, invalidateOnRefresh: true },
        defaults: { ease: 'none' },
      })
      .to(words, { columnGap: gapTo, duration: o.gapDuration, ease: o.gapEase }, 0)
      .to(media, { width: box.width, height: box.height, duration: 1 }, cfg.mediaAt);
  };

  mm.add('(prefers-reduced-motion: no-preference) and (min-width: 1025px)', () => play(o.desktop));
  mm.add('(prefers-reduced-motion: no-preference) and (min-width: 769px) and (max-width: 1024px)', () => play(o.tablet));
  mm.add('(prefers-reduced-motion: no-preference) and (max-width: 768px)', () => play(o.phone));
  return () => mm.revert();
}
