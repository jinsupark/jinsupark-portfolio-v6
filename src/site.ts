type Run = string | { text: string; href: string };

export const SITE = {
  name: 'Jin Su Park',
  headline: 'Experiment until you feel something',
  // Placeholder carried over from the Figma mock.
  caption: ['48MP Fusion Ultra Wide camera', '13 mm focal length (.5x/macro)'],
  bio: [
    [
      'Co-founder of ',
      { text: 'Iteration', href: '#' },
      ', a design practice partnering with select early-stage founders, and ',
      { text: 'Graphical', href: '#' },
      ', a tool for creating visual languages.',
    ],
    [
      'Before that, I led teams at ',
      { text: 'Wealthfront', href: 'https://www.wealthfront.com' },
      ', ',
      { text: 'Dropbox', href: 'https://www.dropbox.com' },
      ', and ',
      { text: 'Groupon', href: 'https://www.groupon.com' },
      '.',
    ],
  ] as Run[][],
  role: 'Designer & engineer',
  about:
    'I make interfaces, identities and generative pictures. Each piece here is composed from experiments in the lab — layered, tuned and kept.',
  contact: [
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/jinsupark-in' },
    { label: 'X', href: 'https://x.com/jinsu' },
    { label: 'GitHub', href: 'https://github.com/jinsupark' },
  ],
};
