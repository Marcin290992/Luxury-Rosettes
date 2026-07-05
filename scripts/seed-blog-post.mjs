// One-time script: creates the first Blog post so /blog isn't empty.
// Safe to re-run — uses a fixed _id and createOrReplace.
//
// Usage:
//   SANITY_API_WRITE_TOKEN=sk... node scripts/seed-blog-post.mjs

import { createClient } from '@sanity/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const img = (...p) => path.join(root, 'src', 'assets', 'img', ...p);

const token = process.env.SANITY_API_WRITE_TOKEN;
if (!token) {
  console.error('Missing SANITY_API_WRITE_TOKEN. Create a write token at https://www.sanity.io/manage → your project → API → Tokens (Editor permission), then re-run:\n  SANITY_API_WRITE_TOKEN=sk... node scripts/seed-blog-post.mjs');
  process.exit(1);
}

const client = createClient({
  projectId: 'qol3jzg4',
  dataset: 'production',
  apiVersion: '2024-01-01',
  token,
  useCdn: false,
});

async function uploadImage(filePath) {
  const buffer = fs.readFileSync(filePath);
  const asset = await client.assets.upload('image', buffer, { filename: path.basename(filePath) });
  return { _type: 'image', asset: { _type: 'reference', _ref: asset._id } };
}

let keyCounter = 0;
const key = () => `k${++keyCounter}`;

const block = (text, style = 'normal') => ({
  _type: 'block',
  _key: key(),
  style,
  children: [{ _type: 'span', _key: key(), text }],
});

const bulletList = (items) =>
  items.map((text) => ({
    _type: 'block',
    _key: key(),
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [{ _type: 'span', _key: key(), text }],
  }));

async function main() {
  const coverImage = await uploadImage(img('gallery', 'Chester', 'kitten-2-web.webp'));

  const body = [
    block(
      "Bengal kittens are irresistible — striking rosettes, a glittered coat, and a personality that's equal parts wild and affectionate. But before you fall for the first pair of green eyes you see, it's worth knowing what separates a healthy, well-bred kitten from one that might bring heartache down the line."
    ),
    block('Start With Health Testing', 'h2'),
    block(
      'Reputable Bengal breeders test their breeding cats for HCM (hypertrophic cardiomyopathy) and PK-Def (pyruvate kinase deficiency), two conditions that can otherwise go unnoticed until it\'s too late. Ask to see the parents\' test results, not just a verbal assurance — a kitten from health-tested parents, backed by a written health guarantee, gives you real peace of mind.'
    ),
    block('Watch How the Kitten Behaves', 'h2'),
    block(
      'A healthy, well-socialised kitten is curious rather than fearful. It should approach you, engage with toys, and settle happily when picked up. Kittens raised inside a family home — around people, other cats, and everyday noise — tend to adapt far more easily to a new household than those raised in isolation.'
    ),
    block('Ask About Age and Timing', 'h2'),
    block(
      "Most reputable breeders won't let kittens leave before 12–14 weeks. This isn't arbitrary — it allows time for a full vaccination course and, just as importantly, for kittens to learn boundaries and confidence from their mother and littermates. A kitten that leaves too early can carry that gap in social development for life."
    ),
    block('A Quick Checklist Before You Commit', 'h2'),
    ...bulletList([
      'Have the parents been health tested for HCM and PK-Def?',
      'Is the kitten TICA-registered, vaccinated, and vet-checked?',
      'Does the breeder offer a written health guarantee?',
      'Can you see how the kitten interacts with people and other pets?',
      'Is ongoing support offered after you bring your kitten home?',
    ]),
    block(
      "Choosing a Bengal kitten is a long-term commitment to a genuinely remarkable breed. Take your time, ask questions, and choose a breeder who's just as invested in the right match as you are."
    ),
  ];

  await client.createOrReplace({
    _id: 'blogPost-how-to-choose-a-healthy-bengal-kitten',
    _type: 'blogPost',
    title: 'How to Choose a Healthy Bengal Kitten: What to Look For',
    slug: { _type: 'slug', current: 'how-to-choose-a-healthy-bengal-kitten' },
    excerpt: "Bringing a Bengal kitten home is one of the most exciting decisions you'll make — here's what a responsible breeder wants you to check before you say yes.",
    coverImage,
    publishedAt: new Date().toISOString(),
    body,
  });

  console.log('✓ blogPost: How to Choose a Healthy Bengal Kitten');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
