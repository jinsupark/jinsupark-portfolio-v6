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
  {
    slug: 'grid',
    title: 'Window grid',
    about:
      'A mosaic of terminal windows that never stops re-cutting itself: cuts slide, windows split open and collapse shut.',
    Component: lazy(() => import('./grid/GridExperiment')),
  },
  {
    slug: 'terminal',
    title: 'Terminal content',
    about:
      'What fills the windows: logs, hex dumps, readouts, big type, progress and survey sheets, all surviving a resize mid-animation.',
    Component: lazy(() => import('./terminal/TerminalExperiment')),
  },
  {
    slug: 'glass',
    title: 'Glass',
    about:
      'The terminal grid raised into glass blocks on a slanted, panning plane: reflected work, spectral light sweeps, edge fringes, bloom and trails.',
    Component: lazy(() => import('./glass/GlassExperiment')),
  },
  {
    slug: 'blueprint',
    title: 'Blueprint',
    about:
      'The window grid as a drawing: paper tones, overrunning hairlines, small print at the junctions and a reserved handful of pictures.',
    Component: lazy(() => import('./blueprint/BlueprintExperiment')),
  },
  {
    slug: 'paths',
    title: 'Node path',
    about:
      'A wandering closed line with numbered nodes, loops and doubled markers, set on a fat sticker outline over a dot grid.',
    Component: lazy(() => import('./paths/PathExperiment')),
  },
  {
    slug: 'scatter',
    title: 'Scattered windows',
    about:
      'Old-OS windows drifting over one picture, each holding a displaced, zoomed fragment of it; they move, resize, close and reopen.',
    Component: lazy(() => import('./scatter/ScatterExperiment')),
  },
  {
    slug: 'cursors',
    title: 'Cursor orbit',
    about:
      'A swarm of pixel pointers on tilted orbits, larger and on top as they come round the front, drifting after your own pointer.',
    Component: lazy(() => import('./cursors/CursorExperiment')),
  },
  {
    slug: 'collage',
    title: 'Collage',
    about:
      'Cut and torn paper pasted down one piece at a time — printed strips, cut-outs, tracing paper — with old pieces ripped off and scraps left behind.',
    Component: lazy(() => import('./collage/CollageExperiment')),
  },
  {
    slug: 'map',
    title: 'City map',
    about:
      'A line-drawn street plan with walking routes laid down in dots, bunching up at each stop with its number, then fading for the next.',
    Component: lazy(() => import('./map/MapExperiment')),
  },
  {
    slug: 'droplet',
    title: 'Water drops',
    about:
      'Draw a shape and it pools into clear water over a photo collage: the edge bends what is under it, splits it into colour, catches the light and casts a blue shadow.',
    Component: lazy(() => import('./droplet/DropletExperiment')),
  },
  {
    slug: 'cloud',
    title: 'Cloud timelapse',
    about:
      'A woodblock cumulus on a blue sky, growing in place like a timelapse: lobes rise, swell and evaporate while the edge boils, fringed in carved white lace.',
    Component: lazy(() => import('./cloud/CloudExperiment')),
  },
];
