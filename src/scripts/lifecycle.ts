// Runs a component's setup now and again after every Astro page swap (View Transitions), and tears it down before the swap.
// Bundled <script> tags run only once per visit, so without this a swapped-in page would stay dead and the old page's
// listeners and animations would stay alive. Without the router the swap events never fire and this is just `init()`.

type Destroy = () => void;
import './scroller'; // on touch devices ScrollTrigger must know the scroll box before any component creates a trigger

// Resolves when the page transition that brought this page in has finished (at once on a first load or without view transitions). A page
// whose intro starts by itself waits for it, or the intro would run under the slide-in of the page.
export function transitionDone(): Promise<unknown> {
  return (window as unknown as { __lrVT?: Promise<unknown> }).__lrVT ?? Promise.resolve();
}

// `only`: a selector of the element the setup is for; on a page without it the setup is skipped (a swap to another page, e.g. the awards,
// used to run every component of the home page there and throw)
export function mount(init: () => Destroy | void, only?: string) {
  let destroy: Destroy | void;
  const run = () => {
    destroy?.();
    destroy = undefined;
    if (only && !document.querySelector(only)) return;
    destroy = init();
  };
  const stop = () => {
    destroy?.();
    destroy = undefined;
  };
  run();
  document.addEventListener('astro:before-swap', stop);
  document.addEventListener('astro:after-swap', run);
}

// Like `mount`, for a setup that lives in a heavy module (three.js, ~500 KB): the module is fetched as a separate file, after the page's own
// scripts have run, and the setup starts once it has arrived. If the page is swapped away before that, the setup is not started at all.
// The scroll triggers are sorted and measured again afterwards, since these were created later than the rest of the page's.
export function mountLazy(load: (root: HTMLElement) => Promise<(root: HTMLElement) => Destroy | void>, only: string) {
  mount(() => {
    const root = document.querySelector<HTMLElement>(only);
    if (!root) return;
    let cancelled = false;
    let destroy: Destroy | void;
    load(root).then(async (init) => {
      if (cancelled) return;
      destroy = init(root);
      const { ScrollTrigger } = await import('gsap/ScrollTrigger');
      ScrollTrigger.sort();
      ScrollTrigger.refresh();
    });
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, only);
}
