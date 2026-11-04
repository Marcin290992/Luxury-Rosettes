// While a page transition runs, further link clicks are ignored: a second tap used to skip the running transition and the page flashed.
const CLS = 'is-transitioning';
const SAFETY_MS = 2500; // unlocks anyway if the transition never reports that it finished
let timer: number | undefined;
let installed = false;

const root = () => document.documentElement;
const unlock = () => {
  window.clearTimeout(timer);
  root().classList.remove(CLS);
};
const lock = () => {
  window.clearTimeout(timer);
  root().classList.add(CLS);
  timer = window.setTimeout(unlock, SAFETY_MS);
};

export function setupTransitionLock() {
  if (installed) return;
  installed = true;
  document.addEventListener(
    'click',
    (e) => {
      if (!root().classList.contains(CLS)) return;
      if (!(e.target as Element | null)?.closest?.('a')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );
  document.addEventListener('astro:before-preparation', lock);
  document.addEventListener('astro:before-swap', (e) => {
    const vt = (e as Event & { viewTransition?: ViewTransition }).viewTransition;
    vt?.finished.then(unlock, unlock);
  });
  // a navigation that ends without a swap (error, same page) must not leave the page locked
  document.addEventListener('astro:page-load', unlock);
}
