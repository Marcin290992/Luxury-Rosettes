// The gallery's "editorial" grid: 8 columns on a desktop, the pictures placed at hand-picked spots (column, row, how many columns / rows they
// span). The pattern repeats every `rowsPerCycle` rows. Zoom levels 1 -> 3 go from many small pictures to a few large ones; "intro" is the big
// two-up layout shown while the hero is still on screen. The index labels "[n]" sit beside each picture (top-right or top-left of it on a
// desktop, above it on a phone). On a phone the pictures simply run in 3 / 2 / 1 columns.

export type Level = 1 | 2 | 3 | 'intro';
type Side = 'top-right' | 'top-left';
type Slot = { col: number; row: number; colSpan: number; rowSpan: number; side: Side };
type Spacing = { cols: number; gapX: number; gapY: number; paddingTop: number; paddingBottom: number; paddingLeft: number; paddingRight: number };

const slot = (col: number, row: number, colSpan: number, rowSpan: number, side: Side): Slot => ({ col, row, colSpan, rowSpan, side });
const R: Side = 'top-right';
const L: Side = 'top-left';

const largeCycle = [
  slot(2, 1, 2, 3, R), slot(5, 1, 2, 3, R), slot(1, 4, 2, 2, R), slot(7, 4, 2, 2, L), slot(3, 6, 3, 3, R), slot(2, 9, 2, 2, R),
  slot(7, 9, 2, 2, L), slot(3, 11, 3, 3, L), slot(1, 14, 2, 2, R), slot(7, 14, 2, 2, L), slot(2, 16, 3, 3, R), slot(6, 19, 3, 3, L),
  slot(1, 22, 2, 2, R), slot(7, 22, 2, 2, L), slot(3, 24, 3, 3, R), slot(2, 27, 2, 2, R), slot(7, 27, 2, 2, L), slot(3, 29, 3, 2, L),
];

interface LayoutSpec {
  pattern: Slot[];
  rowsPerCycle: number;
  mobile: Spacing;
  desktop: Spacing;
}

const mobile = (cols: number, gapY = 30, top = 100): Spacing => ({ cols, gapX: 10, gapY, paddingTop: top, paddingBottom: 20, paddingLeft: 20, paddingRight: 20 });
const desktop = (gap: number, top = 80): Spacing => ({ cols: 8, gapX: gap, gapY: gap, paddingTop: top, paddingBottom: 20, paddingLeft: 20, paddingRight: 20 });

export const GRID_LAYOUTS: Record<Level, LayoutSpec> = {
  1: {
    pattern: [
      slot(2, 1, 1, 1, R), slot(4, 1, 1, 1, L), slot(6, 1, 1, 1, R), slot(8, 1, 1, 1, L), slot(1, 2, 1, 1, R), slot(3, 2, 1, 1, L),
      slot(7, 2, 1, 1, R), slot(4, 3, 1, 1, R), slot(6, 3, 1, 1, L), slot(8, 3, 1, 1, L), slot(1, 4, 1, 1, R), slot(3, 4, 1, 1, R),
      slot(5, 4, 1, 1, L), slot(2, 5, 1, 1, R), slot(6, 5, 1, 1, L), slot(8, 5, 1, 1, L), slot(3, 6, 1, 1, R), slot(5, 6, 1, 1, L),
    ],
    rowsPerCycle: 6,
    mobile: mobile(3),
    desktop: desktop(90),
  },
  2: {
    pattern: [
      slot(3, 1, 1, 1, R), slot(6, 1, 1, 1, R), slot(1, 2, 2, 2, R), slot(4, 2, 1, 1, L), slot(5, 2, 2, 2, R), slot(8, 2, 1, 1, L),
      slot(7, 3, 1, 1, R), slot(2, 4, 1, 1, L), slot(3, 4, 2, 2, R), slot(7, 4, 2, 2, L), slot(1, 5, 1, 1, R), slot(5, 5, 1, 1, R),
      slot(4, 6, 2, 2, R), slot(8, 6, 1, 1, L), slot(1, 7, 1, 1, R), slot(6, 7, 1, 1, R), slot(2, 8, 2, 2, L), slot(6, 8, 2, 2, R),
    ],
    rowsPerCycle: 9,
    mobile: mobile(2),
    desktop: desktop(40),
  },
  3: { pattern: largeCycle, rowsPerCycle: 30, mobile: mobile(1), desktop: desktop(80) },
  intro: {
    pattern: [slot(2, 1, 3, 3, R), slot(5, 1, 3, 3, R), ...largeCycle.slice(2)], // the two large pictures, a little narrower than half the screen each
    rowsPerCycle: 30,
    mobile: { ...mobile(1, 10, 20), paddingLeft: 56, paddingRight: 56 },
    desktop: desktop(20, 20),
  },
};

export const ZOOM_STEPS: Array<1 | 2 | 3> = [1, 2, 3];

/** The zoom level one step in (bigger pictures) or out; "intro" counts as level 2. null at the ends. */
export function neighbourZoom(level: Level, direction: 'in' | 'out'): 1 | 2 | 3 | null {
  const current = level === 'intro' ? 2 : level;
  const i = ZOOM_STEPS.indexOf(current);
  return ZOOM_STEPS[direction === 'in' ? i + 1 : i - 1] ?? null;
}

export interface Placement {
  gridColumn: string;
  gridRow: string;
  side: Side | 'bottom-left';
}

/** Where picture number `index` goes for a zoom level. */
export function placeItem(index: number, level: Level, isDesktop: boolean): Placement {
  const layout = GRID_LAYOUTS[level];
  if (!isDesktop) {
    const cols = layout.mobile.cols;
    return { gridColumn: `${(index % cols) + 1} / span 1`, gridRow: `${Math.floor(index / cols) + 1} / span 1`, side: 'bottom-left' };
  }
  const s = layout.pattern[index % layout.pattern.length];
  const cycle = Math.floor(index / layout.pattern.length);
  return { gridColumn: `${s.col} / span ${s.colSpan}`, gridRow: `${s.row + cycle * layout.rowsPerCycle} / span ${s.rowSpan}`, side: s.side };
}

export function spacingFor(level: Level, isDesktop: boolean): Spacing {
  return isDesktop ? GRID_LAYOUTS[level].desktop : GRID_LAYOUTS[level].mobile;
}
