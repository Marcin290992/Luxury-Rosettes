import type { StructureResolver } from 'sanity/structure';

// The page is a single document, so the Studio opens straight on it (no list of documents).
export const structure: StructureResolver = (S) =>
  S.list()
    .title('Content')
    .items([S.listItem().title('Available kittens').id('kittensPage').child(S.document().title('Available kittens').schemaType('kittensPage').documentId('kittensPage'))]);
