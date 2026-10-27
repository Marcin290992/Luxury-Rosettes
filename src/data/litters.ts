/** One planned or running litter. Months are 'YYYY-MM'. */
export type Litter = {
  dam: string;
  sire: string;
  pairing: string;
  expected: string; // about 65 days after pairing
  ready: string; // about 13 weeks after birth
};

/**
 * The only place the page gets its litters from. Example data for now;
 * later this function is replaced by a query to Sanity and nothing else changes.
 */
export function getLitters(): Litter[] {
  return [
    { dam: 'Kita', sire: 'Draco', pairing: '2026-10', expected: '2026-12', ready: '2027-03' },
    { dam: 'Candy', sire: 'Charlie', pairing: '2026-12', expected: '2027-02', ready: '2027-05' },
  ];
}

const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** A kitten from a born litter. `photo` names an image the page knows; 'sold' kittens are never shown. */
export type Kitten = {
  name: string;
  gender: 'Girl' | 'Boy';
  status: 'available' | 'reserved' | 'sold';
  photo: 'candy' | 'cosmo' | 'charlie' | 'chester';
  text: string;
};

/**
 * Kittens looking for a home. Example data for now; an empty list is fine: the page then shows the next litter and
 * the waiting list instead. Later this is replaced by a query to Sanity, like getLitters().
 */
export function getKittens(): Kitten[] {
  return [
    { name: 'Candy', gender: 'Girl', status: 'available', photo: 'candy', text: 'Curious about everything, with a glittering coat and a soft, affectionate side.' },
    { name: 'Cosmo', gender: 'Boy', status: 'reserved', photo: 'cosmo', text: 'A bold little explorer with a true Bengal spirit and a taste for climbing.' },
    { name: 'Charlie', gender: 'Boy', status: 'available', photo: 'charlie', text: 'Cheeky and clever, always first to work out the new toy.' },
    { name: 'Chester', gender: 'Boy', status: 'available', photo: 'chester', text: 'The friendliest of the bunch, happy to be part of whatever you are doing.' },
  ];
}

/** The litter that is due soonest (this month or later), if any is planned. */
export function nextLitter(litters: Litter[], from = new Date()): Litter | undefined {
  const now = key(from);
  return litters.filter((l) => l.expected >= now).sort((a, b) => a.expected.localeCompare(b.expected))[0];
}

/** 'YYYY-MM' as 'December 2026'. */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
}

