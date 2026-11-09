// The kitten photos are cut to the spots of the home page (scripts/spots.ts, an SVG clipPath each) and open like the photo of the second section
// of the home page (ScrollExpand): the spot starts small in the middle of the frame (the picture zoomed in) and grows to its full size as the
// photo comes up the screen. The spot is scaled through the `transform` of the path inside its clipPath (the frame's `data-clip` names it).
//
// initKittenExpand(frames) is `init` and returns destroy(). The CSS holds each frame in a small, static copy of its spot until this runs
// (no flash of the full photo), and with reduced motion nothing is done (the CSS leaves the spots at full size).

import { smoothstep } from './math';
import { onPageScroll } from './scroller';
import { KITTEN_EXPAND } from './settings';

export function initKittenExpand(frames: HTMLElement[], c = KITTEN_EXPAND): (() => void) | undefined {
  if (!frames.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const media = frames.map((f) => f.querySelector<HTMLElement>('img'));
  const paths = frames.map((f) => document.querySelector<SVGPathElement>(`#${f.dataset.clip} path`));
  frames.forEach((f) => (f.style.clipPath = `url(#${f.dataset.clip})`)); // from the static small copy to the live one
  let raf = 0;

  const apply = () => {
    raf = 0;
    const vh = window.innerHeight;
    frames.forEach((frame, i) => {
      const rect = frame.getBoundingClientRect(); // the clip does not change it
      let p = 1;
      if (rect.bottom > 0 && rect.top < vh) {
        const startTop = vh * c.from; // frame top here: closed
        const endTop = vh * c.to - rect.height / 2; // frame top here: open
        p = Math.min(1, Math.max(0, (startTop - rect.top) / (startTop - endTop || 1)));
      } else if (rect.top >= vh) p = 0;
      const e = smoothstep(0, 1, p);
      const sx = (c.startWidth + (100 - c.startWidth) * e) / 100;
      const sy = (c.startHeight + (100 - c.startHeight) * e) / 100;
      paths[i]?.setAttribute('transform', `translate(0.5 0.5) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(-0.5 -0.5)`);
      const m = media[i];
      if (m) m.style.transform = `scale(${(c.mediaZoom + (1 - c.mediaZoom) * e).toFixed(4)})`;
    });
  };
  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(apply);
  };

  const offScroll = onPageScroll(onScroll);
  window.addEventListener('resize', onScroll);
  apply();

  return () => {
    offScroll();
    window.removeEventListener('resize', onScroll);
    if (raf) cancelAnimationFrame(raf);
    frames.forEach((f, i) => {
      f.style.clipPath = '';
      paths[i]?.removeAttribute('transform');
      const m = media[i];
      if (m) m.style.transform = '';
    });
  };
}
