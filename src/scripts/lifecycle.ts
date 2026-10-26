// Runs a component's setup now and again after every Astro page swap (View Transitions), and tears it down before the swap.
// Bundled <script> tags run only once per visit, so without this a swapped-in page would stay dead and the old page's
// listeners and animations would stay alive. Without the router the swap events never fire and this is just `init()`.

type Destroy = () => void;

export function mount(init: () => Destroy | void) {
  let destroy: Destroy | void;
  const run = () => {
    destroy?.();
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
