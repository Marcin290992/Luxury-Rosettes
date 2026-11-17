// The "Lumen" intro (markup: LumenIntro.astro), in three acts:
//  1. TITLE   - the words fade in one after another (0.8 s each, from 1 s, then every 0.3 s) while the hand-written "and" draws itself,
//  2. SPIRAL  - once the title is all there (about 3.7 s) 21 paper photos fly through a three.js spiral (lumen-spiral.ts); 1.2 s later the
//               title slides apart and blurs away,
//  3. CHOOSER - 4.7 s into the spiral the gallery chooser (lumen-menu.ts) comes up.
// The spiral is built at once, so its textures are ready in time. If WebGL is not there, or the visitor asked for less motion, the title
// is followed by the chooser straight away. initLumenIntro(root) returns destroy().

import gsap from 'gsap';
import { CUBIC } from './lumen-ease';
import { drawSvg } from './lumen-draw';
import { createSpiral, type Spiral } from './lumen-spiral';
import { initLumenMenu } from './lumen-menu';
import { disposeLayer } from './lumen-layer';
import { WEBGL_ENABLED } from './settings';

const TITLE_DONE = 3.7; // seconds: all the title's parts have finished by then (the last word ends at 3.3 s, the "and" at about 3.7 s)

export function initLumenIntro(root: HTMLElement): () => void {
  const words = Array.from(root.querySelectorAll<HTMLElement>('.li-w'));
  const titleLayer = root.querySelector<HTMLElement>('.li-title-layer')!;
  const bottom = root.querySelector<HTMLElement>('.li-bottom')!;
  const spin = root.querySelector<SVGElement>('.li-spin')!;
  const andHost = root.querySelector<HTMLElement>('.li-and')!;
  const menuRoot = root.querySelector<HTMLElement>('[data-lumen-menu]')!;
  const sources = (root.dataset.spiral ?? '').split('|').filter(Boolean);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const menu = initLumenMenu(menuRoot);
  let spiral: Spiral | undefined;
  let spiralWanted = false;
  let alive = true;
  let titleTimer = 0;
  const timers: number[] = [];

  // the spiral is built at once (its textures load while the title plays)
  if (!reduced && WEBGL_ENABLED && sources.length) {
    createSpiral(sources).then(
      (s) => {
        if (!alive) s.dispose();
        else {
          spiral = s;
          if (spiralWanted) startSpiral();
        }
      },
      () => {
        spiral = undefined;
        if (spiralWanted && alive) menu.open(); // no WebGL: the chooser follows the title at once
      },
    );
  }

  const exitTitle = () => {
    words.forEach((word) => {
      gsap.to(word, { xPercent: Number(word.dataset.exit ?? 0), duration: 1, ease: CUBIC });
    });
    gsap.to(titleLayer, { opacity: 0, filter: 'blur(6px)', duration: 0.8, ease: CUBIC });
    gsap.to(bottom, { opacity: 0, duration: 0.8, ease: CUBIC });
  };

  function startSpiral() {
    if (!spiral) return;
    spiral.play(() => {
      if (alive) menu.open();
    });
    timers.push(window.setTimeout(exitTitle, 1200));
  }

  const startAfterTitle = () => {
    spiralWanted = true;
    if (reduced || !WEBGL_ENABLED || !sources.length) {
      exitTitle();
      menu.open();
      return;
    }
    startSpiral(); // if the spiral is not built yet, it starts the moment it is
  };

  // ---- act 1: the title ----
  const timeline = gsap.timeline();
  words.forEach((word) => {
    timeline.fromTo(word, { opacity: 0 }, { opacity: 1, duration: 0.8, ease: CUBIC }, 1 + 0.3 * Number(word.dataset.i ?? 0));
  });
  timeline.fromTo(bottom, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.8, ease: CUBIC }, 1.2);
  timeline.fromTo(spin, { opacity: 0 }, { opacity: 1, duration: 0.8, ease: CUBIC }, 1.7);
  const drawing = drawSvg(andHost, { delay: 1.6 });
  titleTimer = window.setTimeout(startAfterTitle, (reduced ? 1.6 : TITLE_DONE) * 1000);

  return () => {
    alive = false;
    window.clearTimeout(titleTimer);
    timers.forEach((t) => window.clearTimeout(t));
    drawing.cancel();
    timeline.kill();
    gsap.killTweensOf([titleLayer, bottom, ...words]);
    spiral?.dispose();
    menu.destroy();
    disposeLayer('top');
  };
}
