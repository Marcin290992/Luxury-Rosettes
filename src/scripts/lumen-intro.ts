// The gallery's intro (markup: LumenIntro.astro), no text, on white:
//  1. SPIRAL  - the moment the page is there (as soon as the photos are loaded) 21 paper photos fly through a three.js spiral (lumen-spiral.ts),
//  2. CHOOSER - 4.7 s into the spiral the gallery chooser (lumen-menu.ts) comes up.
// If WebGL is off, or the visitor asked for less motion, the chooser comes up at once. initLumenIntro(root) returns destroy().

import { createSpiral, type Spiral } from './lumen-spiral';
import { initLumenMenu } from './lumen-menu';
import { disposeLayer } from './lumen-layer';
import { WEBGL_ENABLED } from './settings';

export function initLumenIntro(root: HTMLElement): () => void {
  const menu = initLumenMenu(root.querySelector<HTMLElement>('[data-lumen-menu]')!);
  const sources = (root.dataset.spiral ?? '').split('|').filter(Boolean);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let spiral: Spiral | undefined;
  let alive = true;

  if (reduced || !WEBGL_ENABLED || !sources.length) {
    menu.open();
  } else {
    createSpiral(sources).then(
      (s) => {
        if (!alive) {
          s.dispose();
          return;
        }
        spiral = s;
        s.play(() => alive && menu.open());
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
