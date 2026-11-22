# Luxury Rosettes

Website of Luxury Rosettes, a TICA Bengal cattery in High Wycombe, UK.

Built with [Astro](https://astro.build) (static output), GSAP and Lenis for the motion, and a little WebGL (three.js).
The kittens on the Available kittens page are managed in [Sanity](https://www.sanity.io); everything else is in the code.

## Commands

| Command | Action |
| :-- | :-- |
| `npm install` | Install dependencies |
| `npm run dev` | Dev server at `localhost:4321` |
| `npm run build` | Build the site into `dist/` |
| `npm run preview` | Preview the build locally |
| `npm run check` | Type-check the project |

The Sanity Studio is a separate project in `studio/`: run the commands above from that folder
(`npm run dev` for `localhost:3333`, `npm run deploy` to publish it to `*.sanity.studio`).

## Structure

```text
src/
  pages/        one file per page (index, about, our-cats, available-kittens, awards, gallery/)
  components/   sections and widgets, one .astro file each
  scripts/      animation and behaviour (GSAP, Lenis, WebGL); settings.ts holds the timings and sizes
  data/         content the pages read (kittens, galleries, FAQ, SEO data)
  lib/          Sanity client
  layouts/      the shared page shell
  styles/       styles shared by several components
studio/         Sanity Studio (schema and configuration)
docs/           working notes
```

## Sanity

Copy `.env.example` to `.env` and set `SANITY_PROJECT_ID` and `SANITY_DATASET`. Without them the site builds with
sample kittens. The site reads the content when it is built, so a deploy has to follow every publish in the Studio
(a Netlify build hook called from a Sanity webhook does this). Steps still open before launch are in
`docs/sanity-premiere-steps.md`.

## Deploy

Netlify builds `npm run build` and publishes `dist/` (see `netlify.toml`). Node 22 or newer is required.
