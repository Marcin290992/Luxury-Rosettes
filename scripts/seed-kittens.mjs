// One-off: puts the four starting kittens (Candy, Charlie, Chester, Cosmo) into Sanity, with their photos.
// Needs a token that can write: SANITY_WRITE_TOKEN in .env (never commit it). Run: node --env-file=.env scripts/seed-kittens.mjs
// Kittens already in the list (same name) are left alone, so it is safe to run twice.
import { createClient } from '@sanity/client';
import { createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';

const { SANITY_PROJECT_ID: projectId, SANITY_DATASET: dataset = 'production', SANITY_WRITE_TOKEN: token } = process.env;
if (!projectId || !token) {
  console.error('Missing SANITY_PROJECT_ID or SANITY_WRITE_TOKEN in .env');
  process.exit(1);
}
const client = createClient({ projectId, dataset, token, apiVersion: '2025-01-01', useCdn: false });

const KITTENS = [
  { name: 'Candy', line: 'Female, brown rosetted', file: 'candy', text: 'Curious about everything, with a glittering coat and a soft, affectionate side.' },
  { name: 'Charlie', line: 'Male, snow', file: 'charlie', text: 'Cheeky and clever, always first to work out the new toy.' },
  { name: 'Chester', line: 'Male, brown rosetted', file: 'chester', text: 'The friendliest of the bunch, happy to be part of whatever you are doing.' },
  { name: 'Cosmo', line: 'Male, silver', file: 'cosmo', text: 'A bold little explorer with a true Bengal spirit and a taste for climbing.' },
];

// a draft being edited in the Studio would hide what is written here: stop and ask to publish or discard it first
if (await client.getDocument('drafts.kittensPage')) {
  console.error('There is an unpublished draft of "Available kittens" in the Studio. Publish or discard it there first, then run this again.');
  process.exit(1);
}

const page = (await client.getDocument('kittensPage')) ?? { _id: 'kittensPage', _type: 'kittensPage', kittens: [] };
const have = new Set((page.kittens ?? []).map((k) => k.name));
const added = [];
for (const k of KITTENS) {
  if (have.has(k.name)) continue;
  const asset = await client.assets.upload('image', createReadStream(`src/assets/img/cats/${k.file}.webp`), { filename: `${k.file}.webp` });
  added.push({
    _key: randomUUID().slice(0, 12),
    _type: 'kitten',
    name: k.name,
    line: k.line,
    text: k.text,
    alt: `${k.name}, a Bengal kitten`,
    photo: { _type: 'image', asset: { _type: 'reference', _ref: asset._id } },
  });
}
if (!added.length) {
  console.log('All four kittens are already in Sanity. Nothing to do.');
} else {
  await client.createOrReplace({ ...page, kittens: [...(page.kittens ?? []), ...added] });
  console.log(`Added: ${added.map((k) => k.name).join(', ')}. They are published.`);
}
