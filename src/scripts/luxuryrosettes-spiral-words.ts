// The words and the stripes of the Luxury Rosettes spiral: two huge words come out of a blur and slide in from the sides with the scroll, a small line
// fades out as the grid arrives, and stripes rise from the bottom to cover the scene at the end.
// The words come in (`is-in` on the root, see LuxuryRosettesSpiral.astro) once the section is in view AND the page transition is over (Astro keeps
// data-astro-transition on <html> for its length), so the letters do not come out while the page is still sliding in, reduced in size.

import { SplitText } from 'gsap/SplitText';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export interface Words {
  /** Resolves when the page transition is over (at once if there is none), or after a safety delay. */
  afterTransition: Promise<void>;
  /** `px`: pixels scrolled in the track; `vh`: height of the screen; `lineOpacity`: of the small line; `exit`: 0..1 through the stripes. */
  draw(px: number, vh: number, lineOpacity: number, exit: number, wordsOpacity?: number): void;
  dispose(): void;
}

export function createWords(root: HTMLElement, top: HTMLElement, bottom: HTMLElement, line: HTMLElement, stripes: HTMLElement[]): Words {
  const big = [top, bottom].map((el) => SplitText.create(el, { type: 'chars', charsClass: 'sp-lit' }));
  big.forEach((split) => (split.chars as HTMLElement[]).forEach((el, i) => (el.style.transitionDelay = `${i * 0.05}s`)));

  const html = document.documentElement;
  let inView = false;
  let over = !html.hasAttribute('data-astro-transition');
  let resolveOver!: () => void;
  const afterTransition = new Promise<void>((resolve) => (resolveOver = resolve));
  const show = () => root.classList.toggle('is-in', inView && over);
  const markOver = () => {
    if (over && !html.hasAttribute('data-astro-transition')) return;
    over = true;
    resolveOver();
    show();
  };
  if (over) resolveOver();

  const watch = new IntersectionObserver(
    ([entry]) => {
      inView = entry.isIntersecting;
      show();
    },
    { rootMargin: '-30% 0px' },
  );
  watch.observe(root);
  const transitionWatch = new MutationObserver(() => {
    if (!html.hasAttribute('data-astro-transition')) markOver();
  });
  if (!over) transitionWatch.observe(html, { attributes: true, attributeFilter: ['data-astro-transition'] });
  const safety = window.setTimeout(markOver, 3000); // never hold the words (or the canvas) back for longer than this

  return {
    afterTransition,
    draw(px, vh, lineOpacity, exit, wordsOpacity = 1) {
      // the big words slide in from the sides with the scroll; at the very top they are fully out of the screen
      const slide = clamp01(px / (vh * 3.2));
      top.style.transform = `translateX(calc(-100% + ${slide * 100}vw))`;
      bottom.style.transform = `translateX(calc(100% - ${slide * 100}vw))`;
      line.style.opacity = String(lineOpacity);
      top.style.opacity = bottom.style.opacity = String(wordsOpacity);
      const n = stripes.length;
      stripes.forEach((s, i) => {
        const start = (0.3 * (n - 1 - i)) / Math.max(n - 1, 1);
        s.style.transform = `scaleY(${clamp01((exit * 0.7 - start) / 0.3)})`;
      });
    },
    dispose() {
      window.clearTimeout(safety);
      watch.disconnect();
      transitionWatch.disconnect();
      big.forEach((split) => split.revert());
      [top, bottom, line, ...stripes].forEach((el) => el.removeAttribute('style'));
      root.classList.remove('is-in');
    },
  };
}
