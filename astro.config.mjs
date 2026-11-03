// @ts-check
import { defineConfig } from 'astro/config';
import os from 'node:os';
import path from 'node:path';

// https://astro.build/config
export default defineConfig({
  // needed for the menu to fetch the next pages ahead of the tap (astro:prefetch); links are not prefetched on their own
  prefetch: { prefetchAll: false },
  vite: {
    // Keep Vite's dependency cache outside Dropbox: its file locking breaks
    // the optimizer (EBUSY), which leaves the browser with duplicate gsap copies.
    cacheDir: path.join(os.tmpdir(), 'luxury-rosettes-vite'),
  },
});
