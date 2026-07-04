import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { visionTool } from '@sanity/vision';
import { presentationTool } from 'sanity/presentation';
import { schemaTypes } from './src/sanity/schemaTypes';

export default defineConfig({
  name: 'default',
  title: 'Luxury Rosettes',

  projectId: 'qol3jzg4',
  dataset: 'production',

  plugins: [
    structureTool(),
    presentationTool({
      previewUrl: 'https://luxuryrosettes.co.uk',
    }),
    visionTool(),
  ],

  schema: {
    types: schemaTypes,
  },
});
