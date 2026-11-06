import { clamp } from './math';

// The stripes of the site's "accordion" transition (the end of the awards spiral is the same idea, the stripe cover and the Why Bengals
// chapter use this): a few stripes stand on top of each other and rise from the bottom one after another, the lowest one first, driven by
// the scroll. `progress` is 0..1; the top stripe is full exactly at 1.
export function drawStripes(stripes: HTMLElement[], progress: number) {
  const n = stripes.length;
  stripes.forEach((stripe, i) => {
    const start = (0.3 * (n - 1 - i)) / Math.max(n - 1, 1);
    stripe.style.transform = `scaleY(${clamp((progress - start) / 0.7, 0, 1)})`;
  });
}
