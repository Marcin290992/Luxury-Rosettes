import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'parentCat',
  title: 'Parent Cat',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'role',
      title: 'Role',
      type: 'string',
      description: 'Displayed as "The Queen" / "The King"',
      options: {
        list: [
          { title: 'Queen', value: 'Queen' },
          { title: 'King', value: 'King' },
        ],
        layout: 'radio',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'image',
      title: 'Photo',
      type: 'image',
      options: { hotspot: true },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'bio',
      title: 'Biography Paragraphs',
      type: 'array',
      of: [{ type: 'text', rows: 3 }],
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: 'closingQuote',
      title: 'Closing Quote',
      type: 'string',
      description: 'The final italic line, e.g. "A true queen in every sense..."',
    }),
    defineField({
      name: 'order',
      title: 'Display Order',
      type: 'number',
      description: 'Lower numbers appear first.',
      validation: (Rule) => Rule.required(),
    }),
  ],
  orderings: [
    {
      title: 'Display Order',
      name: 'orderAsc',
      by: [{ field: 'order', direction: 'asc' }],
    },
  ],
  preview: {
    select: { title: 'name', subtitle: 'role', media: 'image' },
  },
});
