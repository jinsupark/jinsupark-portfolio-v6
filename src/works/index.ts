import type { Artwork } from '@/studio/document';

// Saved artworks: `src/works/<slug>/artwork.json`, written by the studio,
// with the `thumb.jpg` it captured beside it.
const DOCS = import.meta.glob<Artwork>('./*/artwork.json', {
  eager: true,
  import: 'default',
});
const THUMBS = import.meta.glob<string>('./*/thumb.jpg', {
  eager: true,
  import: 'default',
  query: '?url',
});

export type Work = { slug: string; doc: Artwork; thumb?: string };

export const WORKS: Work[] = Object.entries(DOCS)
  .map(([file, doc]) => {
    const slug = file.split('/')[1];
    return { slug, doc, thumb: THUMBS[`./${slug}/thumb.jpg`] };
  })
  .sort((a, b) => a.doc.title.localeCompare(b.doc.title));

export const workOf = (slug: string) => WORKS.find((w) => w.slug === slug);
