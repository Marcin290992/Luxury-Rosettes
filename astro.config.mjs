// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import sanity from '@sanity/astro';
import react from '@astrojs/react';

// @sanity/astro's built-in "module-dedupe" Vite plugin rewrites the bare
// `sanity` / `styled-components` specifiers to their resolved package
// directories to avoid duplicate-copy issues in monorepos. In this plain
// (non-monorepo) npm install, that rewrite makes esbuild's dependency
// scanner resolve the import to the package's `package.json` instead of its
// real entry point, breaking `/studio` (blank page, or
// "No matching export in .../package.json for import Studio" during dev).
// Disabling it lets normal node-module resolution handle `sanity` correctly.
process.env.SANITY_ASTRO_DISABLE_MODULE_DEDUPE = '1';

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss()]
  },
  integrations: [
    react(),
    sanity({
      projectId: 'qol3jzg4',
      dataset: 'production',
      useCdn: false,
      apiVersion: '2024-01-01',
      studioBasePath: '/studio',
    }),
  ],
});