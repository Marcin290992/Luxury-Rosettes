import { faqs } from './faqs';

const SITE = 'https://luxuryrosettes.co.uk';

// A trail of pages for search engines (Home > Gallery > ...). `trail` is a list of [name, path].
export const breadcrumb = (...trail: [string, string][]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [['Home', '/'], ...trail].map(([name, path], i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name,
    item: SITE + path,
  })),
});

// The questions of the FAQ on the home page, as structured data
export const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};
