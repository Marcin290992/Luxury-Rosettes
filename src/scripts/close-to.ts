// Close-to: the words of a heading start far apart and slide together while the picture between the two lines below opens (grows from nothing),
// all on one scrubbed timeline. Adapted from the 71three "Close to the work" section to Vanilla TS + GSAP for this site (docs/SCRIPTING.md).
//  - the END state is the CSS (words close, picture open): without the script, or with reduced motion, that is what you see; the script only
//    reads those end values (so phone / tablet / desktop sizes live in one place, the CSS) and plays the way to them,
//  - three sizes (phone, tablet, desktop) through gsap.matchMedia: other start gaps, start points and scrub speeds (settings.ts CLOSE_TO),
//  - initCloseTo(root) is `init` and returns destroy(); everything is looked up inside `root`.
//
// Expected markup (see CloseTo.astro): root > h2.ct-words > span x n, .ct-media (the picture), the two lines around it.

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
