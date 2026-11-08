import { ScrollTrigger } from 'gsap/ScrollTrigger';

// After a click through to another page (the router swaps the page, there is no real "load" event) ScrollTrigger measures everything while the page is
// still being built: the images are not in yet, the fonts are not in, the other scenes of the page have not made their pins. Its measures stay stale (a
// scene that starts too early, a card already shrunk when it arrives). After a refresh the browser's `load` makes it measure again; here the same is done by
// hand: once when each image and the fonts arrive, and a few times in the first seconds, always a little after the last thing that changed.
export function refreshWhenSettled(): () => void {
  let timer: number | undefined;
  const timers: number[] = [];
  // A refresh rebuilds every pin and scrub: done while the page is being scrolled it makes the scenes jump. So it waits for the scroll to stop.
  let lastScroll = 0;
  const onScroll = () => {
    lastScroll = performance.now();
  };
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  const kick = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(function run() {
      if (performance.now() - lastScroll < 400) {
        timer = window.setTimeout(run, 400);
        return;
      }
      try {
        ScrollTrigger.refresh();
      } catch {
        /* the page is going away */
      }
    }, 150);
  };

  // lazy images are not waited for: they load while the visitor scrolls (their frames already have their size), a refresh for each would shake the page
  const pending = Array.from(document.images).filter((img) => !img.complete && img.loading !== 'lazy');
  pending.forEach((img) => img.addEventListener('load', kick, { once: true }));
  document.fonts?.ready.then(kick).catch(() => {});
  [500, 1500, 3500].forEach((ms) => timers.push(window.setTimeout(kick, ms)));
  window.addEventListener('load', kick, { once: true });

  return () => {
    window.clearTimeout(timer);
    timers.forEach((t) => window.clearTimeout(t));
    pending.forEach((img) => img.removeEventListener('load', kick));
    window.removeEventListener('load', kick);
    document.removeEventListener('scroll', onScroll, { capture: true });
  };
}
