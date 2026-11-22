import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';
import candy from '../assets/img/cats/candy.webp';
import kita from '../assets/img/cats/kita.webp';
import cosmo from '../assets/img/cats/cosmo.webp';
import chester from '../assets/img/cats/chester.webp';
import draco from '../assets/img/cats/draco.webp';
import charlie from '../assets/img/cats/charlie.webp';
import heroPhoto from '../assets/img/hero_img.webp';

// The two "Luxury Bengal" galleries (intro chooser + gallery pages). Placeholders: the photos are the site's cats, the names and captions are sample
// text, to be replaced with the real galleries. One place for both pages, so the chooser and the gallery agree on names, colours and links.

export type LuxuryBengalPhoto = { id: string; title: string; time: string; credit: string; src: string; full: string; width: number; height: number; alt: string };

export interface LuxuryBengalGallery {
  id: 'one' | 'two';
  href: string;
  name: string; // the big wordmark of the gallery's hero (also its name in the chooser)
  title: string;
  background: string; // the page and chooser colour while this gallery is the one in view
  accent: string; // the hero wordmark's and the chooser text's colour on that background
  italic: boolean; // the wordmark is set in italics (the second gallery)
  coverSrc: string; // the chooser cover (3:4)
  coverWidth: number;
  coverHeight: number;
  photos: LuxuryBengalPhoto[];
}

const SOURCES: ImageMetadata[] = [candy, kita, cosmo, chester, draco, charlie, heroPhoto];
const MONTHS = ['January', 'March', 'April', 'June', 'September', 'October', 'November', 'December'];

// each distinct source is optimised once (a grid size and a large one for the viewer)
async function optimise() {
  return Promise.all(
    SOURCES.map(async (src) => {
      const small = await getImage({ src, width: 1000 });
      const full = await getImage({ src, width: 2000 });
      // the first two pictures of a gallery are shown large and side by side (and turned over onto the page): they are cut to the same 4:3, so they are
      // exactly the same size and what is turned over is exactly the picture that stays
      const crop = await getImage({ src, width: 1000, height: 750, fit: 'cover' });
      const cropFull = await getImage({ src, width: 2000, height: 1500, fit: 'cover' });
      return {
        src: small.src,
        full: full.src,
        cropFull: cropFull.src,
        width: small.attributes.width as number,
        height: small.attributes.height as number,
        crop: { src: crop.src, width: 1000, height: 750 },
      };
    }),
  );
}

function makePhotos(count: number, offset: number, prefix: string, optimised: Awaited<ReturnType<typeof optimise>>): LuxuryBengalPhoto[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const o = optimised[(i + offset) % optimised.length];
    return {
      id: String(n),
      title: `Sample Portrait ${n}`,
      time: `${MONTHS[(i + offset) % MONTHS.length]} ${2018 + ((i + offset) % 8)}`,
      credit: 'PHOTO: PLACEHOLDER',
      src: i < 2 ? o.crop.src : o.src,
      full: i < 2 ? o.cropFull : o.full,
      width: i < 2 ? o.crop.width : o.width,
      height: i < 2 ? o.crop.height : o.height,
      alt: `${prefix} ${String(n).padStart(2, '0')}`,
    };
  });
}

export async function getLuxuryBengalGalleries() {
  const optimised = await optimise();
  const coverOne = await getImage({ src: kita, width: 720, height: 960, fit: 'cover' });
  const coverTwo = await getImage({ src: draco, width: 720, height: 960, fit: 'cover' });
  const galleries: LuxuryBengalGallery[] = [
    {
      id: 'one',
      href: '/gallery/one/',
      name: 'LUXURY BENGAL',
      title: 'Gallery One',
      background: '#252525',
      accent: '#7D7676',
      italic: false,
      coverSrc: coverOne.src,
      coverWidth: 720,
      coverHeight: 960,
      photos: makePhotos(36, 0, 'One', optimised),
    },
    {
      id: 'two',
      href: '/gallery/two/',
      name: 'NOCTURNE',
      title: 'Gallery Two',
      background: '#E3E3E3',
      accent: '#707070',
      italic: true,
      coverSrc: coverTwo.src,
      coverWidth: 720,
      coverHeight: 960,
      photos: makePhotos(30, 4, 'Two', optimised),
    },
  ];
  // the 21 papers of the intro's spiral: the first gallery's photos
  const spiral = galleries[0].photos.slice(0, 7).map((p) => p.src);
  return { galleries, spiral };
}
