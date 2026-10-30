// The portfolio. Read this file top to bottom and you have seen the site's work
// section, in the order it appears.
//
// This list is **authoritative for three things**: which projects are shown, in
// what order, and what they say. It is not authoritative for imagery — screenshots
// and loops are still discovered by globbing `src/assets/projects/<year>/<id>/`,
// because hand-maintaining ~410 filenames is a job for a computer. So adding a
// project is: drop the files in, add a row here.
//
// That second step is the point rather than the cost. Which work to show is an
// editorial decision, and while the filesystem alone decided it there was no way
// to hold a project back, stage one you were still shooting, or retire one without
// moving files around. A folder with no row here is simply not on the site yet,
// which makes `src/assets/projects/` usable as a staging area.
//
// It fails loudly in both directions (see `checkCatalogue` in `projectImages.ts`):
// a row with no assets, and assets with no row, each warn in dev. That check is
// what makes this design safe — the objection to a hand-listed catalogue is that
// forgetting the row makes work quietly vanish, and it only stays quiet if nothing
// is watching.
//
// Fields are deliberately the four that have somewhere to go today. Role, client,
// links and tags belong here eventually, but each should arrive with the piece of
// UI that reads it, rather than as 67 rows of guesswork about a layout that
// doesn't exist yet.

export type Project = {
  // There is no category field, deliberately: in v5 a hand-tagged
  // digital/brand/graphic split turned out to be describing the calendar, so
  // `year` is the only axis a row carries.
  //
  // `year` and `id` together locate the assets: `src/assets/projects/<year>/<id>/`.
  // Two fields rather than one `'<year>/<id>'` string, so a row is data you can
  // read and edit a field at a time instead of a path you have to parse by eye.
  year: string;
  id: string;
  // Written, not derived from the id — a folder can't know its own capitalisation
  // or editorial identity.
  name: string;
  // The descriptive half of the detail heading, for the few projects that want
  // one: `Rinse UI — Design System Documentation Tool (2024)`.
  title?: string;
  // Empty is the normal state, and renders as no paragraph rather than a gap. See
  // PROJECT-BLURB-GUIDE.md for the shared voice and structure.
  blurb?: string;
};

// Newest first, alphabetical within a year — but only as a starting point. This is
// the running order, so lead with whatever deserves to be led with.
//
// One project per line, which is the only reason this is readable at 67 rows —
// `.prettierrc` gives this file a wider `printWidth` so the longest names don't
// get exploded into six lines apiece. Keep a row on one line.
export const PROJECT_LIST: Project[] = [
  { year: '2025', id: 'data-residency', name: 'Data Residency', blurb: '' }, // motion
  { year: '2025', id: 'devin-ai', name: 'Devin AI', blurb: '' },
  { year: '2025', id: 'miranote-ai', name: 'Miranote AI', blurb: '' },
  { year: '2025', id: 'onlua', name: 'Onlua', blurb: '' },

  {
    year: '2024',
    id: 'archive',
    name: 'Archive',
    blurb: '',
  }, // motion
  { year: '2024', id: 'lumebrite', name: 'Lumebrite', blurb: '' }, // motion
  {
    year: '2024',
    id: 'made-independent',
    name: 'Made Independent',
    blurb: '',
  }, // motion
  {
    year: '2024',
    id: 'rinse-ui',
    name: 'Rinse UI',
    title: 'Design System Documentation Tool',
    blurb:
      'Designed and developed end to end, this internal documentation tool gave the team a shared source of truth for its design system and component library. It brought design decisions, component behavior, and implementation guidance into one place, keeping ideas aligned and making the handoff from design to development more direct and consistent.\n\nIts architecture was deliberately lightweight, scalable, and adaptable, using a minimal static-site stack to generate fast previews directly from Markdown. The low setup cost made it easy to adopt, while the flexible structure could accommodate custom documentation needs as the system and team evolved.',
  },
  {
    year: '2024',
    id: 'screen-of-death',
    name: 'Screen Of Death',
    blurb: '',
  }, // motion

  { year: '2023', id: 'atomic-ui', name: 'Atomic UI', blurb: '' },
  {
    year: '2023',
    id: 'beckon-awards',
    name: 'Beckon Awards',
    blurb: '',
  }, // motion
  { year: '2023', id: 'castle-ai', name: 'Castle AI', blurb: '' },
  { year: '2023', id: 'ent-studio', name: 'Ent Studio', blurb: '' }, // motion
  {
    year: '2023',
    id: 'lumebrite-studio',
    name: 'Lumebrite Studio',
    blurb: '',
  },
  { year: '2023', id: 'nverse', name: 'Nverse', blurb: '' },
  {
    year: '2023',
    id: 'sodo',
    name: 'Sodo',
    title: 'Premium Men’s Activewear',
    blurb:
      'An alternative brand identity and packaging concept for the same Seattle-based premium men’s activewear company, developed to explore a bolder and more traditionally masculine expression of its performance-led positioning. The scope again covered brand art direction, the core mark, and packaging, translating the company’s focus on advanced textile manufacturing, comfort, and performance into a distinct visual direction.\n\nWhere Sodo Athletic Lab emphasized laboratory precision, this concept favored stronger contrast, heavier visual weight, and a palette rooted in traditionally masculine colors. The resulting system gave the brand a more assertive presence while preserving the clarity, craft, and functional character expected of a premium activewear product.',
  },
  {
    year: '2023',
    id: 'sodo-athletic-lab',
    name: 'Sodo Athletic Lab',
    title: 'Premium Men’s Activewear',
    blurb:
      'A brand identity and packaging system designed for a Seattle-based premium men’s activewear company using innovative textile manufacturing to balance considered construction with comfort and performance. The scope covered brand art direction, the core mark, and the overall packaging direction, establishing a cohesive visual language across the identity and physical product experience.\n\nThe direction drew from the precision of a laboratory, using clean, symmetrical geometry to express technical rigor without losing refinement. At its center, an S-shaped mark is constructed as a vortex, giving the system a sense of controlled motion that reflects both the brand’s experimental process and the active nature of its products.',
  },

  { year: '2022', id: 'hopmedic', name: 'Hopmedic', blurb: '' },
  {
    year: '2022',
    id: 'labas-lumiere',
    name: 'Labas Lumiere',
    blurb: '',
  },
  { year: '2022', id: 'marslofi', name: 'Marslofi', blurb: '' }, // motion
  { year: '2022', id: 'moonlogo', name: 'Moonlogo', blurb: '' }, // motion
  { year: '2022', id: 'north-four', name: 'North Four', blurb: '' },
  { year: '2022', id: 'saintsaint', name: 'Saintsaint', blurb: '' },
  { year: '2022', id: 'sass', name: 'Sass', blurb: '' },
  { year: '2022', id: 'siwan', name: 'Siwan', blurb: '' },

  { year: '2021', id: 'castle', name: 'Castle', blurb: '' },
  {
    year: '2021',
    id: 'uniformicons',
    name: 'Uniformicons',
    blurb: '',
  },

  { year: '2020', id: 'runboy', name: 'Runboy', blurb: '' },

  {
    year: '2019',
    id: 'senderplate',
    name: 'Senderplate',
    blurb: '',
  },

  { year: '2018', id: 'portfolio', name: 'Portfolio', blurb: '' },

  { year: '2017', id: 'bonjak', name: 'Bonjak', blurb: '' },
  {
    year: '2017',
    id: 'gloryleague',
    name: 'Gloryleague',
    blurb: '',
  },
  { year: '2017', id: 'payment-express', name: 'Payment Express', blurb: '' },
  {
    year: '2017',
    id: 'sitting-monkeys',
    name: 'Sitting Monkeys',
    blurb: '',
  },
  { year: '2017', id: 'surreality', name: 'Surreality', blurb: '' },
  { year: '2017', id: 'sveva', name: 'Sveva', blurb: '' },
  { year: '2017', id: 'thai-aerospace', name: 'Thai Aerospace', blurb: '' },
  { year: '2017', id: 'theory-temple', name: 'Theory Temple', blurb: '' },

  { year: '2016', id: 'design-studio', name: 'Design Studio', blurb: '' },
  { year: '2016', id: 'flora', name: 'Flora', blurb: '' },
  { year: '2016', id: 'kikoshi', name: 'Kikoshi', blurb: '' },
  { year: '2016', id: 'midas', name: 'Midas', blurb: '' },

  { year: '2015', id: 'atrium-theatre', name: 'Atrium Theatre', blurb: '' },
  {
    year: '2015',
    id: 'floral-ornament',
    name: 'Floral Ornament',
    blurb: '',
  },
  {
    year: '2015',
    id: 'hutman-architects',
    name: 'Hutman Architects',
    blurb: '',
  },
  { year: '2015', id: 'javelin-power', name: 'Javelin Power', blurb: '' },

  {
    year: '2014',
    id: 'solid-existence',
    name: 'Solid Existence',
    blurb: '',
  },
  {
    year: '2014',
    id: 'untitled-publishing',
    name: 'Untitled Publishing',
    blurb: '',
  },

  { year: '2013', id: 'break-reality', name: 'Break Reality', blurb: '' },
  { year: '2013', id: 'champion', name: 'Champion', blurb: '' },
  { year: '2013', id: 'makers-laces', name: 'Makers Laces', blurb: '' },
  {
    year: '2013',
    id: 'through-all-seasons',
    name: 'Through All Seasons',
    blurb: '',
  },

  { year: '2012', id: 'cupids-cuppa', name: 'Cupids Cuppa', blurb: '' },
  { year: '2012', id: 'power-city', name: 'Power City', blurb: '' },

  { year: '2011', id: 'botanic-beauty', name: 'Botanic Beauty', blurb: '' },
  { year: '2011', id: 'depthcore', name: 'Depthcore', blurb: '' },
  {
    year: '2011',
    id: 'world-electronica',
    name: 'World Electronica',
    blurb: '',
  },

  { year: '2010', id: 'ivy-heart', name: 'Ivy Heart', blurb: '' },
  { year: '2010', id: 'omega-code', name: 'Omega Code', blurb: '' },
  { year: '2010', id: 'pinocchio', name: 'Pinocchio', blurb: '' },
  { year: '2010', id: 'speero', name: 'Speero', blurb: '' },
  {
    year: '2010',
    id: 'the-petal-company',
    name: 'The Petal Company',
    blurb: '',
  },
  { year: '2010', id: 'trap', name: 'Trap', blurb: '' },

  { year: '2009', id: 'bwmb', name: 'Bwmb', blurb: '' },
  {
    year: '2009',
    id: 'grandfathers-take',
    name: 'Grandfathers Take',
    blurb: '',
  },
  { year: '2009', id: 'luminary-films', name: 'Luminary Films', blurb: '' },

  { year: '2008', id: 'digital-art', name: 'Digital Art', blurb: '' },
];

// `<year>/<id>` — the shape the asset globs and the gallery map are keyed by.
// Everything that has to match a row against a folder goes through here, so the
// two halves can't disagree about the separator.
export const projectKey = (p: Pick<Project, 'year' | 'id'>) =>
  `${p.year}/${p.id}`;
