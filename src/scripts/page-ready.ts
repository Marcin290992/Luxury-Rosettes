// A page transition must not start showing the new page while something on it is still popping in. A component that builds something
// asynchronously (photos for a WebGL scene) hands its promise to holdTransition() while the page is being swapped in; the router's
// swap (Layout.astro) then waits for all of them - but never longer than `maxMs`, so a slow connection cannot freeze the navigation.

const held: Promise<unknown>[] = [];

export function holdTransition(p: Promise<unknown>) {
  held.push(p.catch(() => {}));
}

export async function awaitHeld(maxMs = 900) {
  if (!held.length) return;
  const all = Promise.all(held.splice(0));
  await Promise.race([all, new Promise((resolve) => setTimeout(resolve, maxMs))]);
  // two frames, so what has just been loaded has also been drawn
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
