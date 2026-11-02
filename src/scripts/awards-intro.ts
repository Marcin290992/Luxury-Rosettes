// Awards intro: one pinned screen scrubbed by the scroll. The headline slides up and away, the line under it lights up word by word and
// goes out, and the photo that filled the screen shrinks to a small rounded tile. The next section rises under it while it does: four
// columns of small photos that drift up at different speeds around a line of text.
//
// Adapted from the Codegrid "Waabi Scroll Animation" to Vanilla TS for this site (see docs/SCRIPTING.md, section 3):
//  - initAwardsIntro(root) is `init` and returns destroy(); everything is looked up inside `root` (the whole intro block),
//  - the pin is CSS sticky inside a tall track (as in the other chapters), not a GSAP pin with a margin trick, and the next section
//    rises under it by a negative margin in the CSS,
//  - the scroll position is smoothed once (a proxy that ScrollTrigger scrubs) and everything is drawn from that one number, so the
//    headline, the words and the photo always agree; the words are set once, not by a `gsap.set` per word per scroll event,
//  - the numbers are in settings.ts (AWARDS_INTRO).
//
// Expected markup (see AwardsIntro.astro): root > .wi-hero (the track) > .wi-pin > .wi-img, .wi-header, .wi-copy h3; .wi-about > .wi-col x4.

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { AWARDS_INTRO } from './settings';

gsap.registerPlugin(ScrollTrigger, SplitText);

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const between = (p: number, from: number, to: number) => clamp01((p - from) / (to - from));

export function initAwardsIntro(root: HTMLElement, o = AWARDS_INTRO) {
  const mm = gsap.matchMedia();
  let words: SplitText | undefined;

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const track = root.querySelector<HTMLElement>('.wi-hero')!;
    const pin = root.querySelector<HTMLElement>('.wi-pin')!;
    const img = root.querySelector<HTMLElement>('.wi-img')!;
    const header = root.querySelector<HTMLElement>('.wi-header')!;
    const copy = root.querySelector<HTMLElement>('.wi-copy h3')!;
    const about = root.querySelector<HTMLElement>('.wi-about')!;
    const columns = Array.from(root.querySelectorAll<HTMLElement>('.wi-col'));

    track.dataset.live = '';
    root.style.setProperty('--wi-length', String(o.length));
    root.style.setProperty('--wi-overlap', String(o.overlap));
    words = SplitText.create(copy, { type: 'words', wordsClass: 'wi-word' });

    // everything is drawn from one number, the scroll position of the pinned part (0..1)
    const draw = (p: number) => {
      const narrow = window.innerWidth <= 1000;
      gsap.set(header, { yPercent: -between(p, 0, o.headerEnd) * 100 });

      const lit = between(p, o.words[0], o.words[1]);
      const count = words!.words.length;
      words!.words.forEach((word, i) => {
        (word as HTMLElement).style.opacity = clamp01((lit - i / count) / (1 / count)).toFixed(3);
      });
      copy.style.opacity = (1 - between(p, o.copyHideAt, o.copyHideAt + o.copyFade)).toFixed(3);

      // the photo shrinks from the whole screen to the tile
      const k = between(p, o.shrink[0], o.shrink[1]);
      const tile = narrow ? o.tile.narrow : o.tile.wide;
      gsap.set(img, {
        width: gsap.utils.interpolate(pin.clientWidth, tile, k),
        height: gsap.utils.interpolate(pin.clientHeight, tile, k),
        borderRadius: gsap.utils.interpolate(0, o.radius, k),
      });
    };

    const state = { p: 0 };
    draw(0);
    gsap.to(state, {
      p: 1,
      ease: 'none',
      onUpdate: () => draw(state.p),
      scrollTrigger: { trigger: track, start: 'top top', end: 'bottom bottom', scrub: o.scrub, invalidateOnRefresh: true, onRefresh: () => draw(state.p) },
    });

    // the columns of photos drift up, each at its own speed (on a narrow screen they stand in a line)
    columns.forEach((col, i) => {
      const c = o.columns[i];
      gsap.fromTo(
        col,
        { x: narrowX(c.x), y: c.from },
        { y: c.to, ease: 'none', scrollTrigger: { trigger: about, start: 'top bottom', end: 'bottom top', scrub: true } },
      );
    });

    return () => {
      delete track.dataset.live;
      root.style.removeProperty('--wi-length');
      root.style.removeProperty('--wi-overlap');
    };

    function narrowX(x: number) {
      return window.innerWidth <= 1000 ? 0 : x;
    }
  });

  return () => {
    mm.revert();
    words?.revert();
  };
}
