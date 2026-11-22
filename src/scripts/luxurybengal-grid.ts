// Where the gallery's pictures sit. On a desktop the grid has 8 columns and the pictures take fixed spots in a pattern that repeats every
// `cycleRows` rows. Zoom level 1 is many small pictures, 3 a few large ones, and 'intro' the two big pictures shown while the hero is still on
// screen. On a phone the pictures simply run in 3, 2 or 1 columns.

export type Level = 1 | 2 | 3 | 'intro';

/** A spot in the pattern: [column, row, columns wide, rows tall], counted from 1. */
type Spot = readonly [number, number, number, number];

interface Spacing {
  cols: number;
  gapX: number;
  gapY: number;
  paddingTop: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
}

interface Layout {
  spots: readonly Spot[];
  cycleRows: number;
  desktop: Spacing;
  phone: Spacing;
}

const small: readonly Spot[] = [
  [2, 1, 1, 1], [5, 1, 1, 1], [7, 1, 1, 1],
  [1, 2, 1, 1], [4, 2, 1, 1], [8, 2, 1, 1],
  [3, 3, 1, 1], [6, 3, 1, 1],
  [2, 4, 1, 1], [5, 4, 1, 1], [8, 4, 1, 1],
  [1, 5, 1, 1], [4, 5, 1, 1], [7, 5, 1, 1],
  [3, 6, 1, 1], [6, 6, 1, 1],
];

const mixed: readonly Spot[] = [
  [2, 1, 2, 2], [5, 1, 1, 1], [7, 1, 2, 2],
  [4, 2, 1, 1], [1, 3, 1, 1], [3, 3, 2, 2],
  [6, 3, 1, 1], [8, 4, 1, 1], [1, 5, 2, 2],
  [4, 5, 1, 1], [6, 5, 2, 2], [1, 7, 1, 1],
  [3, 7, 1, 1], [5, 7, 1, 1], [8, 7, 1, 1],
];

const large: readonly Spot[] = [
  [1, 1, 3, 3], [6, 2, 3, 3], [3, 5, 2, 2], [7, 6, 2, 2],
  [1, 8, 3, 3], [5, 9, 3, 3], [2, 12, 2, 2], [6, 13, 2, 2],
];

const phone = (cols: number, gapY = 28, top = 100): Spacing => ({ cols, gapX: 10, gapY, paddingTop: top, paddingBottom: 20, paddingLeft: 20, paddingRight: 20 });
const desktop = (gap: number, top = 80): Spacing => ({ cols: 8, gapX: gap, gapY: gap, paddingTop: top, paddingBottom: 20, paddingLeft: 20, paddingRight: 20 });

const LAYOUTS: Record<Level, Layout> = {
  1: { spots: small, cycleRows: 7, desktop: desktop(72), phone: phone(3) },
  2: { spots: mixed, cycleRows: 8, desktop: desktop(36), phone: phone(2) },
  3: { spots: large, cycleRows: 16, desktop: desktop(64), phone: phone(1) },
  // two large pictures side by side, then the pictures of level 3 from the third one on; the grid forms from here (the pictures part and shrink)
  intro: {
    spots: [[2, 1, 3, 3], [5, 1, 3, 3], ...large.slice(2)],
    cycleRows: 16,
    desktop: desktop(16, 20),
    phone: { ...phone(1, 10, 20), paddingLeft: 56, paddingRight: 56 },
  },
};

export interface Placement {
  gridColumn: string;
  gridRow: string;
}

/** The grid area of picture number `index` at a zoom level. */
export function placeItem(index: number, level: Level, isDesktop: boolean): Placement {
  const layout = LAYOUTS[level];
  if (!isDesktop) {
    const { cols } = layout.phone;
    return { gridColumn: `${(index % cols) + 1}`, gridRow: `${Math.floor(index / cols) + 1}` };
  }
  const [col, row, wide, tall] = layout.spots[index % layout.spots.length];
  const shift = Math.floor(index / layout.spots.length) * layout.cycleRows;
  return { gridColumn: `${col} / span ${wide}`, gridRow: `${row + shift} / span ${tall}` };
}

export function spacingFor(level: Level, isDesktop: boolean): Spacing {
  return isDesktop ? LAYOUTS[level].desktop : LAYOUTS[level].phone;
}
