// The morphing photo shapes of the story: paths with an identical command structure, so GSAP can tween one into another.

// Rounded polygon as a path with a fixed command structure, so GSAP can tween one shape into another.
// Coordinates are 0..1 (objectBoundingBox), t = how much of each edge the rounded corner eats.
type Pt = [number, number];
const rounded = (pts: Pt[], t = 0.12) => {
  const n = pts.length;
  const lerp = (a: Pt, b: Pt, k: number): Pt => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  const f = (p: Pt) => `${p[0].toFixed(4)} ${p[1].toFixed(4)}`;
  const s = pts.map((v, i) => lerp(v, pts[(i + n - 1) % n], t));
  const e = pts.map((v, i) => lerp(v, pts[(i + 1) % n], t));
  return `M ${f(e[n - 1])}` + pts.map((v, i) => ` L ${f(s[i])} Q ${f(v)} ${f(e[i])}`).join('') + ' Z';
};
export const bigShapes = [
  rounded([[0.2, 0], [1, 0], [0.9, 1], [0, 0.72]]),
  rounded([[0, 0.05], [0.88, 0], [1, 0.76], [0.12, 1]]),
  rounded([[0.12, 0], [1, 0.12], [0.86, 1], [0, 0.88]]),
];
export const smallShapes = [
  rounded([[0, 0], [0.55, 0.1], [1, 0.85], [0.1, 1]]),
  rounded([[0.1, 0.05], [1, 0], [0.9, 0.9], [0, 1]]),
  rounded([[0, 0.12], [0.9, 0], [1, 1], [0.15, 0.9]]),
];

