import { defineArrayMember, defineField, defineType } from 'sanity';

// One document: the whole Available kittens page. The breeder adds a kitten as a card (photo, name, a few words, description), like posts in WordPress.
// The order of the cards is the order on the site (drag to change it); a kitten that has found a home is simply deleted.
export const kittensPage = defineType({
  name: 'kittensPage',
  title: 'Available kittens',
  type: 'document',
  fields: [
    defineField({
      name: 'kittens',
      title: 'Kittens',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'kitten',
          title: 'Kitten',
          fields: [
            defineField({
              name: 'photo',
              title: 'Photo',
              type: 'image',
              options: { hotspot: true },
              validation: (r) => r.required(),
            }),
            defineField({ name: 'name', title: 'Name', type: 'string', validation: (r) => r.required() }),
            defineField({ name: 'line', title: 'In a few words', description: 'e.g. "Female, brown rosetted"', type: 'string' }),
            defineField({ name: 'text', title: 'Description', type: 'text', rows: 4 }),
            defineField({ name: 'alt', title: 'Photo description', description: 'For people who cannot see the photo and for Google, e.g. "Brown rosetted Bengal kitten on a white blanket". Leave empty and the name is used.', type: 'string' }),
          ],
          preview: { select: { title: 'name', subtitle: 'line', media: 'photo' } },
        }),
      ],
    }),
  ],
  preview: { prepare: () => ({ title: 'Available kittens' }) },
});
