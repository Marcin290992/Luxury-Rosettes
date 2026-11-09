// Shrink intro: one pinned screen scrubbed by the scroll. The headline slides up and away, and the photo that filled the screen shrinks to a small rounded tile. The next section rises under it while it does: four
// columns of small photos that drift up at different speeds around a line of text.
//
// Adapted from the Codegrid "Waabi Scroll Animation" to Vanilla TS for this site (see docs/SCRIPTING.md, section 3):
//  - initShrinkIntro(root) is `init` and returns destroy(); everything is looked up inside `root` (the whole intro block),
//  - the pin is CSS sticky inside a tall track (as in the other chapters), not a GSAP pin with a margin trick, and the next section
//    rises under it by a negative margin in the CSS,
//  - the scroll position is smoothed once (a proxy that ScrollTrigger scrubs) and everything is drawn from that one number, so the
//    headline, the words and the photo always agree; the words are set once, not by a `gsap.set` per word per scroll event,
//  - the numbers are in settings.ts (SHRINK_INTRO).
//
// Expected markup (see ShrinkIntro.astro): root > .si-hero (the track) > .si-pin > .si-img, .si-header; .si-about > .si-col x4.

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { SHRINK_INTRO, WORD_HIDDEN, HERO } from './settings';
import { drawStripes } from './stripes';

gsap.registerPlugin(ScrollTrigger, SplitText);

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const between = (p: number, from: number, to: number) => clamp01((p - from) / (to - from));
// the progress of word `i` of `n` when the whole line goes 0..1 and the words follow one another (the house style: a word rises out of / leaves
// through its own window, one after the other)
const SPREAD = 0.5;
const stagger = (t: number, i: number, n: number) => clamp01((t - (i / n) * SPREAD) / (1 - SPREAD));

export function initShrinkIntro(root: HTMLElement, o = SHRINK_INTRO) {
  const mm = gsap.matchMedia();
  let headWords: SplitText | undefined;
  let opening: gsap.core.Timeline | undefined;

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const track = root.querySelector<HTMLElement>('.si-hero')!;
    const pin = root.querySelector<HTMLElement>('.si-pin')!;
    const img = root.querySelector<HTMLElement>('.si-img')!;
    const header = root.querySelector<HTMLElement>('.si-header')!;
    const about = root.querySelector<HTMLElement>('.si-about')!;
    const columns = Array.from(root.querySelectorAll<HTMLElement>('.si-col'));

    track.dataset.live = '';
    root.style.setProperty('--si-length', String(o.length));
    root.style.setProperty('--si-overlap', String(o.overlap));
    // like every other text of the site, the words sit in their own windows and move through them (no fading)
    headWords = SplitText.create(header.querySelector('h1')!, { type: 'chars,words', mask: 'words', wordsClass: 'si-hword' });

    // everything is drawn from one number, the scroll position of the pinned part (0..1)
    const draw = (p: number) => {
      const narrow = window.innerWidth <= 1000;
      // the headline leaves upward, word after word, each through its own window
      const away = between(p, 0, o.headerEnd);
      const headCount = headWords!.words.length;
      headWords!.words.forEach((word, i) => gsap.set(word, { yPercent: -WORD_HIDDEN * stagger(away, i, headCount) }));

      // the photo shrinks from the whole screen to the tile
      const k = between(p, o.shrink[0], o.shrink[1]);
      const tile = narrow ? o.tile.narrow : o.tile.wide;
      // before it starts to shrink the photo is simply the whole pin (100%, not a measured pixel size: on a phone the measure taken during the page
      // transition could be stale and left gaps at the sides and the bottom until the first scroll)
      gsap.set(img, {
        width: k === 0 ? '100%' : gsap.utils.interpolate(pin.clientWidth, tile, k),
        height: k === 0 ? '100%' : gsap.utils.interpolate(pin.clientHeight, tile, k),
        borderRadius: gsap.utils.interpolate(0, o.radius, k),
      });
    };

    // The opening is the home page's: the photo settles from a slow zoom and the letters of the headline rise out of their windows one after
    // another (the numbers are the hero's, see HERO in settings.ts). It waits for the page transition, which takes ~1s.
    const photo = img.querySelector<HTMLElement>('img');
    const T = HERO.timeline;
    gsap.set(headWords.chars, { yPercent: WORD_HIDDEN });
    if (photo) gsap.set(photo, { scale: HERO.mediaZoom });
    opening = gsap.timeline({ defaults: { ease: 'power3.out' }, delay: 1.05 });
    if (photo) opening.to(photo, { scale: 1, duration: T.zoom }, 0);
    opening.to(headWords.chars, { yPercent: 0, duration: T.chars.dur, stagger: T.chars.stagger }, T.chars.at);

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

    // The line of text in the middle fades out while the tiles are on their way out (over the second half of the hold).
    const aboutText = about.querySelector<HTMLElement>('.si-about-text');
    if (aboutText) {
      gsap.fromTo(
        aboutText,
        { opacity: 1 },
        { opacity: 0, ease: 'none', immediateRender: false, scrollTrigger: { trigger: about, start: 'top top-=45%', end: 'top top-=100%', scrub: true } },
      );
    }
    // Then the stripes (the site's transition, the same as in the Why Bengals chapter and the stripe cover): in the last screen of the hold they rise
    // from the bottom one after another and cover the screen in the colour of the dark page; the photo of the next section comes up while they close,
    // so there is no empty dark screen between them.
    const stripes = Array.from(about.querySelectorAll<HTMLElement>('.si-stripes > div'));
    if (stripes.length) {
      const draw = (p: number) => drawStripes(stripes, p);
      draw(0);
      ScrollTrigger.create({
        trigger: about,
        start: 'top top-=100%',
        end: 'top top-=160%', // the photo of the next section starts to unfold where they end (see `pull` and `lead` of CatStack on the page)
        onUpdate: (self) => draw(self.progress),
        onRefresh: (self) => draw(self.progress),
      });
    }

    return () => {
      opening?.kill();
      delete track.dataset.live;
      root.style.removeProperty('--si-length');
      root.style.removeProperty('--si-overlap');
    };

    function narrowX(x: number) {
      return window.innerWidth <= 1000 ? 0 : x;
    }
  });

  return () => {
    mm.revert();
    headWords?.revert();
  };
}
