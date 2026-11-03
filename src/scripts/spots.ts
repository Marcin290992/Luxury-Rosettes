// The photos are cut to the spots of a Bengal's coat: soft, uneven, no two alike. Each spot is a ring of points around the
// middle of a unit square (a radius per point, so the edge wanders), joined into one smooth closed curve (Catmull-Rom turned
// into cubic Béziers). Used twice: as the clip of the photo and as the thin ring drawn around it, like the outline of a rosette.
export const spotPath = (radii: number[], stretch: [number, number], turn: number) => {
  const n = radii.length;
  const pts = radii.map((r, i) => {
    const a = (i / n) * Math.PI * 2 + turn;
    return [0.5 + Math.cos(a) * r * stretch[0], 0.5 + Math.sin(a) * r * stretch[1]];
  });
  const f = (v: number) => v.toFixed(4);
  let d = `M ${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    d += ` C ${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return `${d} Z`;
};
export const lobes = (n: number, base: number, amount: number, count: number, phase: number) =>
  Array.from({ length: n }, (_, i) => base + amount * Math.cos(count * ((i / n) * Math.PI * 2) + phase));
export const spots = [
  spotPath([0.46, 0.43, 0.47, 0.44, 0.46, 0.42, 0.47, 0.45, 0.43, 0.46], [1, 1], 0.2), // a rounded, slightly lumpy spot
  spotPath([0.48, 0.4, 0.38, 0.44, 0.48, 0.47, 0.4, 0.37, 0.43, 0.47], [0.86, 1], 1.1), // a tall, tapering one
  spotPath([0.46, 0.47, 0.44, 0.3, 0.25, 0.33, 0.44, 0.47, 0.46, 0.45], [1, 0.96], 0.5), // a kidney: dented on one side
  spotPath(lobes(12, 0.4, 0.07, 3, 0.5), [1, 1], 0), // three soft lobes, like a rosette
];