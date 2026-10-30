import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export type Experiment = {
  slug: string;
  title: string;
  about: string;
  Component: LazyExoticComponent<ComponentType>;
};

// Each experiment is its own chunk, so three.js and a heavy shader only load on
// the page that uses them.
export const EXPERIMENTS: Experiment[] = [
  {
    slug: 'poster',
    title: 'Poster',
    about:
      'Wheat-pasted paper, glue creases and sheen, and the rip that reveals the sheet beneath.',
    Component: lazy(() => import('./poster/PosterExperiment')),
  },
];
