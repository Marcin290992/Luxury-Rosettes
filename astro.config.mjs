// @ts-check
import { defineConfig } from 'astro/config';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

// the commit this build was made from, shown in the on-screen debug log (?debug=1) so it is clear which version a phone is running
let build = 'dev';
try {
  build = execSync('git rev-parse --short HEAD').toString().trim();
} catch {
  /* not a git checkout (e.g. a deploy from a zip) */
}

// https://astro.build/config
export default defineConfig({
  // needed for the menu to fetch the next pages ahead of the tap (astro:prefetch); links are not prefetched on their own
  prefetch: { prefetchAll: false },
  vite: {
    define: { __BUILD__: JSON.stringify(build) },
    // Keep Vite's dependency cache outside Dropbox: its file locking breaks
    // the optimizer (EBUSY), which leaves the browser with duplicate gsap copies.
    cacheDir: path.join(os.tmpdir(), 'luxury-rosettes-vite'),
  },
});
