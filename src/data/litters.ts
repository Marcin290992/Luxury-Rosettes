import type { ImageMetadata } from 'astro';
import candy from '../assets/img/cats/candy.webp';
import cosmo from '../assets/img/cats/cosmo.webp';
import charlie from '../assets/img/cats/charlie.webp';
import chester from '../assets/img/cats/chester.webp';
import { fetchSanity } from '../lib/sanity';

/** A kitten's photo: a local image (samples) or a Sanity one (url with its size). */
export type KittenPhoto = { src: ImageMetadata | string; width?: number; height?: number; alt: string };

/** A kitten looking for a home. */
export type Kitten = {
  name: string;
  line: string; // e.g. "Female, brown rosetted"
  text: string;
  photo?: KittenPhoto;
};

const SAMPLE_KITTENS: Kitten[] = [
  { name: 'Candy', line: 'Female, brown rosetted', photo: { src: candy, alt: 'Candy, a Bengal kitten' }, text: 'Curious about everything, with a glittering coat and a soft, affectionate side.' },
  { name: 'Cosmo', line: 'Male, silver', photo: { src: cosmo, alt: 'Cosmo, a Bengal kitten' }, text: 'A bold little explorer with a true Bengal spirit and a taste for climbing.' },
  { name: 'Charlie', line: 'Male, snow', photo: { src: charlie, alt: 'Charlie, a Bengal kitten' }, text: 'Cheeky and clever, always first to work out the new toy.' },
  { name: 'Chester', line: 'Male, brown rosetted', photo: { src: chester, alt: 'Chester, a Bengal kitten' }, text: 'The friendliest of the bunch, happy to be part of whatever you are doing.' },
];

type KittenRow = { name: string; line?: string; text?: string; alt?: string; photo?: { url?: string; width?: number; height?: number } | null };

/**
 * The kittens of the Available kittens page, in the order the breeder put them in Sanity (document "kittensPage"; a kitten that has found a home is deleted there).
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
      line: k.line ?? '',
      text: k.text ?? '',
      photo: k.photo?.url ? { src: k.photo.url, width: k.photo.width, height: k.photo.height, alt: k.alt || `${k.name}, a Bengal kitten` } : undefined,
    }));
}
