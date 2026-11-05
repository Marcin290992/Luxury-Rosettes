// Runs a component's setup now and again after every Astro page swap (View Transitions), and tears it down before the swap.
// Bundled <script> tags run only once per visit, so without this a swapped-in page would stay dead and the old page's
// listeners and animations would stay alive. Without the router the swap events never fire and this is just `init()`.

type Destroy = () => void;
import './scroller'; // on touch devices ScrollTrigger must know the scroll box before any component creates a trigger

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
