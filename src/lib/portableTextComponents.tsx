import { urlFor } from './sanity';
import type { PortableTextComponents } from '@portabletext/react';

export const portableTextComponents: PortableTextComponents = {
  types: {
    image: ({ value }) => {
      const url = urlFor(value).width(1200).auto('format').url();
      return (
        <img
          src={url}
          alt={value.alt || ''}
          loading="lazy"
          style={{ width: '100%', height: 'auto', borderRadius: '8px', margin: '2rem 0' }}
        />
      );
    },
  },
};
