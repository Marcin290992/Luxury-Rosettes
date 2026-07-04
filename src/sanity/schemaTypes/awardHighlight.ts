import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'awardHighlight',
  title: 'Award Highlight',
  type: 'document',
  description: 'The single featured award section shown on the homepage.',
  fields: [
    defineField({
      name: 'organisation',
      title: 'Organisation',
      type: 'string',
      description: 'e.g. "Bengal Cat Association"',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'title',
      title: 'Award Title',
      type: 'string',
      description: 'e.g. "Brown (Black) Spotted Male Adult"',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'body',
      title: 'Body Paragraphs',
      type: 'array',
      of: [{ type: 'text', rows: 3 }],
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: 'image',
      title: 'Award Photo',
      type: 'image',
      options: { hotspot: true },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'recognitionLabel',
      title: 'Recognition Label',
      type: 'string',
      initialValue: 'Official Recognition',
    }),
  ],
  preview: {
    select: { title: 'title', subtitle: 'organisation', media: 'image' },
  },
});
