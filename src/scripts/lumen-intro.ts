// The gallery's intro (markup: LumenIntro.astro), no text, on white:
//  1. SPIRAL  - the moment the page is there (as soon as the photos are loaded) 21 paper photos fly through a three.js spiral (lumen-spiral.ts),
//  2. CHOOSER - 4.7 s into the spiral the gallery chooser (lumen-menu.ts) comes up, and the last two sheets of the spiral land on its covers.
// If WebGL is off, or the visitor asked for less motion, the chooser comes up at once. initLumenIntro(root) returns destroy().

import { createSpiral, type Spiral } from './lumen-spiral';
import { initLumenMenu } from './lumen-menu';
import { disposeLayer } from './lumen-layer';
import { WEBGL_ENABLED } from './settings';

export function initLumenIntro(root: HTMLElement): () => void {
  const menu = initLumenMenu(root.querySelector<HTMLElement>('[data-lumen-menu]')!);
  const sources = (root.dataset.spiral ?? '').split('|').filter(Boolean);
  const covers = (root.dataset.covers ?? '').split('|').filter(Boolean);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let spiral: Spiral | undefined;
  let alive = true;

  if (reduced || !WEBGL_ENABLED || !sources.length) {
    menu.open();
  } else {
    createSpiral(sources, covers).then(
      (s) => {
        if (!alive) {
          s.dispose();
          return;
        }
        spiral = s;
        // 4.7 s into the flight the chooser comes up (without turning its covers over) and the last two sheets of the spiral, which show the
        // covers, fly to where the covers are and become them
        s.play(() => {
          if (!alive) return;
          menu.open({ fold: false });
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              s.landOn(menu.cardRects(), () => {
                if (!alive) return;
                menu.revealCards();
                requestAnimationFrame(() => s.hideHeroes());
              }),
            ),
          );
        });
      },
      () => alive && menu.open(), // the photos or WebGL failed: the chooser follows at once
    );
  }

  return () => {
    alive = false;
    spiral?.dispose();
    menu.destroy();
    disposeLayer('top');
  };
}
