import type { ImageMetadata } from 'astro';
import candy from '../assets/img/cats/candy.webp';
import cosmo from '../assets/img/cats/cosmo.webp';
import charlie from '../assets/img/cats/charlie.webp';
import chester from '../assets/img/cats/chester.webp';
import { fetchSanity } from '../lib/sanity';

/** One planned or running litter. Months are 'YYYY-MM'. */
export type Litter = {
  dam: string;
  sire: string;
  pairing: string;
  expected: string; // about 65 days after pairing
  ready: string; // about 13 weeks after birth
};

const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Sample litters, used only while Sanity is not configured or cannot be reached. */
const SAMPLE_LITTERS: Litter[] = [
  { dam: 'Kita', sire: 'Draco', pairing: '2026-10', expected: '2026-12', ready: '2027-03' },
  { dam: 'Candy', sire: 'Charlie', pairing: '2026-12', expected: '2027-02', ready: '2027-05' },
];

/** The only place the page gets its litters from: Sanity (type "litter"), with sample data as a fallback. */
export async function getLitters(): Promise<Litter[]> {
  const rows = await fetchSanity<Litter[]>(`*[_type == "litter"] | order(expected asc){ dam, sire, pairing, expected, ready }`);
  return rows ?? SAMPLE_LITTERS;
}

/** A kitten's photo: a local image (samples) or a Sanity one (url with its size). */
export type KittenPhoto = { src: ImageMetadata | string; width?: number; height?: number; alt: string };

/** A kitten from a born litter. 'sold' kittens are never shown. */
export type Kitten = {
  name: string;
  gender?: string;
  status: 'available' | 'reserved' | 'sold';
  line: string; // e.g. "Female, brown rosetted"
  text: string;
  photo?: KittenPhoto;
};

const SAMPLE_KITTENS: Kitten[] = [
  { name: 'Candy', status: 'available', line: 'Female, brown rosetted', photo: { src: candy, alt: 'Candy, a Bengal kitten' }, text: 'Curious about everything, with a glittering coat and a soft, affectionate side.' },
  { name: 'Cosmo', status: 'reserved', line: 'Male, silver', photo: { src: cosmo, alt: 'Cosmo, a Bengal kitten' }, text: 'A bold little explorer with a true Bengal spirit and a taste for climbing.' },
  { name: 'Charlie', status: 'available', line: 'Male, snow', photo: { src: charlie, alt: 'Charlie, a Bengal kitten' }, text: 'Cheeky and clever, always first to work out the new toy.' },
  { name: 'Chester', status: 'available', line: 'Male, brown rosetted', photo: { src: chester, alt: 'Chester, a Bengal kitten' }, text: 'The friendliest of the bunch, happy to be part of whatever you are doing.' },
];

type KittenRow = { name: string; line?: string; text?: string; alt?: string; photo?: { url?: string; width?: number; height?: number } | null };

/**
 * The kittens of the Available kittens page, in the order the breeder put them in Sanity (document "kittensPage"; sold ones are simply deleted).
 * Sample data while Sanity is not configured or cannot be reached. An empty list is fine: the page then says there are none at the moment.
 */
export async function getKittens(): Promise<Kitten[]> {
  const rows = await fetchSanity<KittenRow[] | null>(
    `*[_id == "kittensPage"][0].kittens[]{ name, line, text, alt, "photo": photo{ "url": asset->url, "width": asset->metadata.dimensions.width, "height": asset->metadata.dimensions.height } }`,
  );
  if (!rows) return SAMPLE_KITTENS;
  return rows
    .filter((k) => k.name)
    .map((k) => ({
      name: k.name,
      status: 'available' as const,
      line: k.line ?? '',
      text: k.text ?? '',
      photo: k.photo?.url ? { src: k.photo.url, width: k.photo.width, height: k.photo.height, alt: k.alt || `${k.name}, a Bengal kitten` } : undefined,
    }));
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
