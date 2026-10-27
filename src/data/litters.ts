/** One planned or running litter. Months are 'YYYY-MM'. */
export type Litter = {
  dam: string;
  sire: string;
  pairing: string;
  expected: string; // about 65 days after pairing
  ready: string; // about 13 weeks after birth
};

export type CalendarEvent = { kind: 'pair' | 'exp' | 'ready'; label: string; parents: string };

const LABEL: Record<CalendarEvent['kind'], string> = {
  pair: 'Pairing',
  exp: 'Expected litter',
  ready: 'Kittens ready',
};

const FIELD = { pair: 'pairing', exp: 'expected', ready: 'ready' } as const;

/**
 * The only place the calendar gets its litters from. Example data for now;
 * later this function is replaced by a query to Sanity and nothing else changes.
 */
export function getLitters(): Litter[] {
  return [
    { dam: 'Kita', sire: 'Draco', pairing: '2026-10', expected: '2026-12', ready: '2027-03' },
    { dam: 'Candy', sire: 'Charlie', pairing: '2026-12', expected: '2027-02', ready: '2027-05' },
  ];
}

const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** The next `count` months from `from`, each with the events that fall in it. */
export function buildMonths(litters: Litter[], count: number, from = new Date()) {
  const name = new Intl.DateTimeFormat('en-GB', { month: 'long' });
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth() + i, 1);
    const events: CalendarEvent[] = litters.flatMap((l) =>
      (['pair', 'exp', 'ready'] as const)
        .filter((kind) => l[FIELD[kind]] === key(d))
        .map((kind) => ({ kind, label: LABEL[kind], parents: `${l.dam} × ${l.sire}` })),
    );
    return { name: name.format(d), year: d.getFullYear(), events };
  });
}
