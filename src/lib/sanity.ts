import { createClient } from '@sanity/client';

const projectId = import.meta.env.SANITY_PROJECT_ID;
const dataset = import.meta.env.SANITY_DATASET || 'production';

/** Sanity client, or null when the project is not configured (the site then uses its sample data). */
export const sanity = projectId ? createClient({ projectId, dataset, apiVersion: '2025-01-01', useCdn: false }) : null;

/**
 * Runs a GROQ query at build time. Returns null when Sanity is not configured or cannot be reached, so a page always builds
 * (the caller falls back to sample data). Pass `[]`-like fallbacks from the caller, not from here.
 */
export async function fetchSanity<T>(query: string, params: Record<string, unknown> = {}): Promise<T | null> {
  if (!sanity) return null;
  try {
    return await sanity.fetch<T>(query, params);
  } catch (e) {
    console.warn('[Sanity] query failed, using sample data:', (e as Error).message);
    return null;
  }
}

/** A Sanity photo as the site needs it: a CDN url with its real size (so the page can reserve the space) and its description. */
export type SanityPhoto = { url: string; width: number; height: number; alt?: string };

/** GROQ projection for an image field called `photo`. */
export const PHOTO = `photo{ "url": asset->url, "width": asset->metadata.dimensions.width, "height": asset->metadata.dimensions.height, alt }`;
