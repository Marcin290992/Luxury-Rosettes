// @ts-check
import { defineConfig } from 'astro/config';
import os from 'node:os';
import path from 'node:path';

// https://astro.build/config
export default defineConfig({
  vite: {
    // Keep Vite's dependency cache outside Dropbox: its file locking breaks
    // the optimizer (EBUSY), which leaves the browser with duplicate gsap copies.
    cacheDir: path.join(os.tmpdir(), 'luxury-rosettes-vite'),
  },
});
