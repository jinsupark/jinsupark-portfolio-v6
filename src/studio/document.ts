// The artwork document: everything needed to rebuild a composed piece, and
// nothing about how the studio happened to be showing it. Saved as
// `src/works/<slug>/artwork.json`.

import type { ShapeDoc } from './shape';

export const DOC_VERSION = 1;

// Frames and every renderer inside them work in design units, not pixels: the
// artwork is always `DESIGN` units across, whatever size it's shown at, so a
// 9-unit font is the same share of the piece on a phone and on a 5K screen.
// One unit is roughly one CSS pixel at a typical desktop display height.
export const DESIGN = { w: 800, h: 1000 } as const;

export const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'difference',
  'exclusion',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'add',
] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

export type Frame = { x: number; y: number; w: number; h: number; rot: number };

export type Mask = {
  // Id of the layer whose pixels decide where this one shows; `null` is none.
  source: string | null;
  mode: 'alpha' | 'luma';
  invert: boolean;
};

// Applied to the layer's own pixels before it's blended, in this order.
export type LayerFx = {
  pixelate: number; // cells across the layer; 0 is off
  mono: boolean;
  invert: boolean;
  posterize: number; // levels per channel; 0 is off
  threshold: number; // 0 is off
  dither: boolean; // two-colour ordered dither, `ink` on `paper`
  ditherScale: number; // design units per dither cell
  ink: string;
  paper: string;
};

export type LayerDoc = {
  id: string;
  // A built-in type (`grid`), or `local/<name>` for a variant packaged with
  // this artwork under `src/works/<slug>/layers/<name>.ts`.
  type: string;
  // The type's version when the values were saved, so a later change to a
  // layer type can be noticed rather than silently re-rendering old work.
  version: number;
  name: string;
  visible: boolean;
  frame: Frame;
  opacity: number;
  blend: BlendMode;
  mask: Mask;
  fx: LayerFx;
  values: Record<string, unknown>;
  // The outline the shader fills. Absent is the whole frame, as a rectangle.
  shape?: ShapeDoc;
  // Whether the shader is laid out in the shape's frame and moves with it, or
  // across the whole artwork so the shape is a window onto it.
  fillSpace?: 'shape' | 'canvas';
  // Border treatment and booleans, each checked against its schema in
  // `studioSchemas.ts` (`edgeSchema`, `combineSchema`).
  edge?: Record<string, unknown>;
  combine?: Record<string, unknown>;
};

export type Post = { grain: number; grainSize: number; vignette: number };

export type Artwork = {
  version: number;
  slug: string;
  title: string;
  about: string;
  featured: boolean;
  background: string;
  // Bottom to top.
  layers: LayerDoc[];
  post: Post;
};

export const NO_FX: LayerFx = {
  pixelate: 0,
  mono: false,
  invert: false,
  posterize: 0,
  threshold: 0,
  dither: false,
  ditherScale: 2,
  ink: '#111111',
  paper: '#f2f0eb',
};

export const fullFrame = (): Frame => ({
  x: 0,
  y: 0,
  w: DESIGN.w,
  h: DESIGN.h,
  rot: 0,
});

export const newArtwork = (slug = 'untitled'): Artwork => ({
  version: DOC_VERSION,
  slug,
  title: 'Untitled',
  about: '',
  featured: false,
  background: '#e3e1dc',
  layers: [],
  post: { grain: 0.04, grainSize: 1, vignette: 0 },
});

export const layerId = () => Math.random().toString(36).slice(2, 9);

export const SLUG = /^[a-z0-9][a-z0-9-]*$/;
