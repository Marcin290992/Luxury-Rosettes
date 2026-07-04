// One-time migration: pushes the site's existing hardcoded content into Sanity
// as real documents, so nothing goes blank once the site starts reading from
// the CMS. Safe to re-run — every document uses a fixed _id and createOrReplace.
//
// Usage:
//   SANITY_API_WRITE_TOKEN=sk... node scripts/seed-sanity.mjs

import { createClient } from '@sanity/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const img = (...p) => path.join(root, 'src', 'assets', 'img', ...p);

const token = process.env.SANITY_API_WRITE_TOKEN;
if (!token) {
  console.error('Missing SANITY_API_WRITE_TOKEN. Create a write token at https://www.sanity.io/manage → your project → API → Tokens (Editor permission), then re-run:\n  SANITY_API_WRITE_TOKEN=sk... node scripts/seed-sanity.mjs');
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

async function seedKittens() {
  const kittens = [
    {
      slug: 'candy',
      name: 'Candy',
      gender: 'Girl',
      description: 'Candy is our sweet Bengal girl with a glittering coat and beautifully defined rosettes. She is curious about everything around her and loves to explore, making her a lively and fun companion. Candy enjoys interactive play but also has a soft, affectionate side. She loves to curl up next to you after her adventures. Raised in a family home with other cats and a big dog, she is confident, well-socialised, and ready to adapt to her forever family.',
      file: img('gallery', 'Candy', 'Candy-2.webp'),
    },
    {
      slug: 'cosmo',
      name: 'Cosmo',
      gender: 'Boy',
      description: 'Cosmo is a bold little explorer with a true Bengal spirit. He loves climbing, jumping, and discovering new places, always showing his adventurous side. His sparkling coat and striking markings make him just as beautiful as he is charming. Cosmo is playful and energetic, but he is also very people-oriented and enjoys following you around the house. Growing up around a large dog, he is fearless and will easily fit into a home with other pets.',
      file: img('gallery', 'Cosmo', 'Cosmo-1-webp.webp'),
    },
    {
      slug: 'charlie',
      name: 'Charlie',
      gender: 'Boy',
      description: "Charlie is our cheeky boy with a mischievous sparkle in his eyes. Always up to something funny, he has a clever and sneaky side that makes him absolutely entertaining to be around. He's the one who figures out toys first and finds new ways to play. Despite his cheekiness, Charlie is affectionate and enjoys attention, often looking for cuddles after his playful antics. With his strong rosettes and glittered coat, he's both handsome and full of character.",
      file: img('gallery', 'Charlie', 'desktop.webp'),
    },
    {
      slug: 'chester',
      name: 'Chester',
      gender: 'Boy',
      description: "Chester is the friendliest of the bunch and always eager to interact with people. He has a gentle, loving nature and loves being part of whatever you're doing. Playful and full of energy, Chester enjoys chasing toys and wrestling with his siblings, but he's equally happy sitting with you and purring away. His affectionate personality, combined with his stunning Bengal looks, makes him the perfect all-around family kitten.",
      file: img('gallery', 'Chester', 'kitten-2-web.webp'),
    },
  ];

  for (const [i, k] of kittens.entries()) {
    const mainImage = await uploadImage(k.file);
    await client.createOrReplace({
      _id: `kitten-${k.slug}`,
      _type: 'kitten',
      name: k.name,
      gender: k.gender,
      description: k.description,
      mainImage,
      order: i + 1,
    });
    console.log(`✓ kitten: ${k.name}`);
  }
}

async function seedParentCats() {
  const cats = [
    {
      slug: 'kita',
      name: 'Kita',
      role: 'Queen',
      file: img('Kita.webp'),
      bio: [
        'Kita is our stunning golden queen, radiating elegance, intelligence, and gentle charm. Her warm, golden coat with rich, beautifully contrasted rosettes and a silky glittered texture makes her truly eye-catching. She has a refined wild expression balanced with a soft, affectionate nature, giving her both beauty and soul.',
        'Kita moves with grace and confidence, always observing her surroundings with curiosity and keen awareness. She loves to be close to her family, offering affectionate head rubs, soft purrs, and warm companionship. Calm, loving, and deeply bonded with her humans, she brings harmony and warmth to our home.',
        'As a mother, she is exceptional, nurturing, patient, and attentive, teaching her kittens both confidence and gentle manners. Her kittens inherit her stunning looks, sweet disposition, and balanced temperament, making them wonderful companions and show quality prospects.',
        'Kita comes from carefully selected lines known for health, temperament, and excellent type. With her expressive eyes, elegant structure, and affectionate personality, she represents everything we strive for in our breeding program: beauty, intelligence, and a loving, family-friendly temperament.',
      ],
      closingQuote: 'A true queen in every sense, graceful, kind, and absolutely captivating.',
    },
    {
      slug: 'draco',
      name: 'Draco',
      role: 'King',
      file: img('Draco.webp'),
      bio: [
        'Draco is an outstanding silver Bengal male with a breathtaking, high-contrast pattern and strong wild expression. His muscular body, sleek coat, and intense eyes give him a majestic presence. He looks like a miniature leopard in the home. His coat shimmers beautifully in the light, and his rosettes are bold and perfectly defined, showcasing exceptional breed quality.',
        'Beyond his impressive looks, Draco has a confident and affectionate personality. He loves attention, enjoys interacting with people, and proudly shows off his elegance and power. Despite his strong appearance, he is gentle and loving, showing the balanced temperament we value in our breeding program.',
        'Draco comes from excellent Champion bloodlines and has proven himself in the show ring. He consistently passes on his striking features, structure, and confident, social temperament to his kittens. All health tests are clear, ensuring that he produces healthy, strong, and stunning offspring.',
      ],
      closingQuote: 'A true example of the Bengal breed: elegant, athletic, intelligent, and affectionate. Draco is a king in every way.',
    },
  ];

  for (const [i, c] of cats.entries()) {
    const image = await uploadImage(c.file);
    await client.createOrReplace({
      _id: `parentCat-${c.slug}`,
      _type: 'parentCat',
      name: c.name,
      role: c.role,
      image,
      bio: c.bio,
      closingQuote: c.closingQuote,
      order: i + 1,
    });
    console.log(`✓ parentCat: ${c.name}`);
  }
}

async function seedGalleryPhotos() {
  const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15];
  for (const [i, n] of numbers.entries()) {
    const image = await uploadImage(img('gallery', `${n}.webp`));
    await client.createOrReplace({
      _id: `gallery-photo-${n}`,
      _type: 'galleryPhoto',
      image,
      alt: `Luxury Rosettes Bengal cats — gallery photo ${i + 1}`,
      order: i + 1,
    });
    console.log(`✓ galleryPhoto: ${n}.webp`);
  }
}

async function seedAwardHighlight() {
  const image = await uploadImage(img('awards.webp'));
  await client.createOrReplace({
    _id: 'award-highlight',
    _type: 'awardHighlight',
    organisation: 'Bengal Cat Association',
    title: 'Brown (Black) Spotted Male Adult',
    body: [
      'We are honored that our Bengals have been recognized with numerous prestigious awards from the Bengal Cat Association. Among the distinctions received are First Place in multiple classes, Best of Breed, Best in Show Adult, and the highly coveted title of Overall Best in Show Bengal 2024.',
      'Each of these awards reflects the very best qualities of the Bengal breed striking beauty, exceptional coat pattern, robust health, and a gentle yet confident temperament. Such recognition is only given to cats that truly embody the breed standard and stand out in the eyes of international judges.',
      'For us, these achievements go beyond trophies and ribbons. They are a testament to the years of dedication, care, and passion we have invested in our breeding program. They confirm that our Bengals are not only admired in the show hall but also respected within the wider Bengal community.',
      'We are proud to share these accomplishments with families who welcome our Bengals into their homes, knowing they are bringing in a cat of outstanding quality and proven excellence.',
    ],
    image,
    recognitionLabel: 'Official Recognition',
  });
  console.log('✓ awardHighlight');
}

async function seedAwardGalleryImages() {
  for (let n = 1; n <= 6; n++) {
    const image = await uploadImage(img(`award${n}.webp`));
    await client.createOrReplace({
      _id: `award-gallery-${n}`,
      _type: 'awardGalleryImage',
      image,
      alt: `Award gallery image ${n}`,
      order: n,
    });
    console.log(`✓ awardGalleryImage: award${n}.webp`);
  }
}

async function seedFaqs() {
  const faqs = [
    { q: 'How much does a Bengal kitten cost?', a: 'Pricing varies based on lineage, markings, and show potential. Please contact us directly for current availability and personalised pricing — each kitten is individually assessed for quality and temperament.' },
    { q: 'Are your kittens health tested?', a: 'Yes. All kittens receive comprehensive health testing including HCM and PK-Def screening, full veterinary examination, and age-appropriate vaccinations. Every kitten leaves with a written health guarantee.' },
    { q: 'What is the adoption process?', a: 'We begin with a short consultation to understand your lifestyle, followed by an application and contract. A deposit secures your chosen kitten, after which you receive regular updates, photos, and videos until collection day.' },
    { q: 'Do you offer shipping and delivery?', a: 'We offer ground transport within the UK and flight nanny service for international families. Personal collection at our location is always preferred. Contact us to discuss timing and logistics.' },
    { q: 'What age do kittens go to their new homes?', a: 'Our kittens are ready at 12–14 weeks. This ensures a complete vaccination course, proper socialisation with mother and littermates, and the confidence and independence your kitten needs to settle beautifully into your home.' },
    { q: 'What care do Bengal cats require?', a: 'Bengals thrive on high-quality protein-rich food, daily interactive play, and mental enrichment — climbing structures and puzzle toys are ideal. Weekly brushing keeps their stunning coat in condition. We provide a full care guide with every kitten.' },
    { q: 'Can I visit your cattery before adopting?', a: 'Approved applicants are warmly welcome to visit by appointment. You will meet our cats and kittens, see our home environment, and ask any questions in person. Biosecurity protocols are in place to protect our cats.' },
    { q: 'What support do you offer after adoption?', a: "We remain available for guidance throughout your Bengal's lifetime — nutrition, behaviour, health, and anything else that arises. We also love receiving updates as your kitten grows." },
  ];

  for (const [i, faq] of faqs.entries()) {
    await client.createOrReplace({
      _id: `faq-${i + 1}`,
      _type: 'faq',
      question: faq.q,
      answer: faq.a,
      order: i + 1,
    });
    console.log(`✓ faq ${i + 1}`);
  }
}

async function main() {
  await seedKittens();
  await seedParentCats();
  await seedGalleryPhotos();
  await seedAwardHighlight();
  await seedAwardGalleryImages();
  await seedFaqs();
  console.log('\nDone. All content seeded into Sanity.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
