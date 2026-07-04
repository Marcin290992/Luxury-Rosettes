import { sanityClient } from 'sanity:client';
import { createImageUrlBuilder, type SanityImageSource } from '@sanity/image-url';

const builder = createImageUrlBuilder(sanityClient);

export function urlFor(source: SanityImageSource) {
  return builder.image(source);
}

export function responsiveImage(source: SanityImageSource, widths: number[]) {
  const srcset = widths
    .map((w) => `${urlFor(source).width(w).auto('format').url()} ${w}w`)
    .join(', ');
  const src = urlFor(source).width(widths[widths.length - 1]).auto('format').url();
  return { src, srcset };
}

export interface Kitten {
  _id: string;
  name: string;
  gender: 'Girl' | 'Boy';
  description: string;
  mainImage: SanityImageSource;
}

export interface ParentCat {
  _id: string;
  name: string;
  role: 'Queen' | 'King';
  image: SanityImageSource;
  bio: string[];
  closingQuote?: string;
}

export interface GalleryPhoto {
  _id: string;
  image: SanityImageSource;
  alt: string;
}

export interface AwardHighlight {
  _id: string;
  organisation: string;
  title: string;
  body: string[];
  image: SanityImageSource;
  recognitionLabel?: string;
}

export interface AwardGalleryImage {
  _id: string;
  image: SanityImageSource;
  alt: string;
}

export interface Faq {
  _id: string;
  question: string;
  answer: string;
}

export async function getKittens(): Promise<Kitten[]> {
  return sanityClient.fetch(`*[_type == "kitten"] | order(order asc)`);
}

export async function getParentCats(): Promise<ParentCat[]> {
  return sanityClient.fetch(`*[_type == "parentCat"] | order(order asc)`);
}

export async function getGalleryPhotos(): Promise<GalleryPhoto[]> {
  return sanityClient.fetch(`*[_type == "galleryPhoto"] | order(order asc)`);
}

export async function getAwardHighlight(): Promise<AwardHighlight | null> {
  return sanityClient.fetch(`*[_type == "awardHighlight"][0]`);
}

export async function getAwardGalleryImages(): Promise<AwardGalleryImage[]> {
  return sanityClient.fetch(`*[_type == "awardGalleryImage"] | order(order asc)`);
}

export async function getFaqs(): Promise<Faq[]> {
  return sanityClient.fetch(`*[_type == "faq"] | order(order asc)`);
}
