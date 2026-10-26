// Small numeric helpers shared by the scroll sequences.

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** 0 below `e0`, 1 above `e1`, an eased S-curve between them. */
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0 || 1e-6), 0, 1); // (the guard keeps e0 === e1 from dividing by zero)
  return t * t * (3 - 2 * t);
};
