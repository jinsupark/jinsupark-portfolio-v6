import {
  color,
  range,
  select,
  toggle,
  when,
  type Schema,
} from '@/lab/controls';
import { BLEND_MODES, DESIGN, type LayerDoc } from './document';
import type { ShapeKind } from './shape';

// The inspector shows a layer's placement, compositing and filters through the
// same control rows as a layer's own settings, so each gets a small schema.
// Controls that would do nothing at their current settings carry a `when`,
// so the inspector only shows what's in play.

const on = (key: string) => (v: Record<string, unknown>) => Number(v[key]) > 0;

export const frameSchema = {
  x: range('Transform', 0, -DESIGN.w, DESIGN.w * 2, 1),
  y: range('Transform', 0, -DESIGN.h, DESIGN.h * 2, 1),
  w: range('Transform', DESIGN.w, 1, DESIGN.w * 3, 1, 'width'),
  h: range('Transform', DESIGN.h, 1, DESIGN.h * 3, 1, 'height'),
  rot: range('Transform', 0, -180, 180, 0.5, 'rotation °'),
};

export const compositeSchema = {
  opacity: range('Appearance', 1, 0, 1, 0.01),
  blend: select(
    'Appearance',
    'normal',
    BLEND_MODES.map((m) => ({ value: m, label: m })),
  ),
};

export const maskSchema = (layer: LayerDoc, layers: LayerDoc[]): Schema => {
  const masked = (v: Record<string, unknown>) => !!v.source;
  return {
    source: select('Mask', layer.mask.source ?? '', [
      { value: '', label: 'none' },
      ...layers
        .filter((l) => l.id !== layer.id)
        .map((l) => ({ value: l.id, label: l.name })),
    ]),
    mode: when(
      select('Mask', 'alpha', [
        { value: 'alpha', label: 'alpha' },
        { value: 'luma', label: 'luminance' },
      ]),
      masked,
    ),
    invert: when(toggle('Mask', false), masked),
  };
};

export const shapeSchema = (kind: ShapeKind): Schema => {
  if (kind === 'rect')
    return { radius: range('Shape', 0, 0, 500, 0.5, 'corner radius') };
  if (kind === 'polygon') return { sides: range('Shape', 6, 3, 16, 1) };
  if (kind === 'star')
    return {
      points: range('Shape', 5, 3, 24, 1),
      inner: range('Shape', 0.45, 0.05, 0.98, 0.01, 'inner radius'),
    };
  return {};
};

// Changes to the outline itself, so the fills, strokes and shadows all follow
// them: a tear moves the edge, a feather softens it.
export const edgeSchema = {
  tear: range('Edge', 0, 0, 40, 0.1, 'torn edge'),
  tearScale: when(
    range('Edge', 0.06, 0.005, 0.5, 0.001, 'tear frequency'),
    on('tear'),
  ),
  seed: range('Edge', 1, 1, 999, 1, 'tear seed'),
  feather: range('Edge', 0, 0, 120, 0.5),
};

export const strokeSchema = {
  width: range('Stroke', 2, 0.1, 80, 0.1),
  align: select(
    'Stroke',
    'center',
    [
      { value: 'inside', label: 'inside' },
      { value: 'center', label: 'centre' },
      { value: 'outside', label: 'outside' },
    ],
    'position',
  ),
  offset: range('Stroke', 0, -80, 80, 0.5),
  fibers: range('Stroke', 0, 0, 2, 0.01, 'paper fibres'),
};

export const shadowSchema = {
  x: range('Shadow', 6, -120, 120, 0.5, 'offset x'),
  y: range('Shadow', 10, -120, 120, 0.5, 'offset y'),
  blur: range('Shadow', 14, 0, 160, 0.5),
  color: color('Shadow', '#1a1712', 'colour'),
};

export const BOOLEAN_OPS = [
  { value: 'none', label: 'none' },
  { value: 'union', label: 'unify' },
  { value: 'intersect', label: 'intersect' },
  { value: 'subtract', label: 'subtract' },
  { value: 'exclude', label: 'exclude' },
];

// Up to three other layers' shapes folded into this one, in order. The fill
// and every edge effect apply to the result. Each step appears once the one
// before it is in use.
export const combineSchema = (layer: LayerDoc, layers: LayerDoc[]): Schema => {
  const others = [
    { value: '', label: 'pick a layer' },
    ...layers
      .filter((l) => l.id !== layer.id)
      .map((l) => ({ value: l.id, label: l.name })),
  ];
  const used = (k: number) => (v: Record<string, unknown>) =>
    k === 0 || (v[`op${k}`] ?? 'none') !== 'none';
  const s: Schema = {};
  for (const k of [1, 2, 3]) {
    s[`op${k}`] = when(
      select('Combine', 'none', BOOLEAN_OPS, k === 1 ? 'operation' : 'then'),
      used(k - 1),
    );
    s[`with${k}`] = when(select('Combine', '', others, 'with'), used(k));
  }
  s.smooth = when(range('Combine', 0, 0, 120, 0.5, 'smooth join'), used(1));
  return s;
};

// Filters, by type. `main` is the value shown in the filter's row.
export const FILTERS: Record<
  string,
  { label: string; main?: string; schema: Schema }
> = {
  blur: {
    label: 'Blur',
    main: 'radius',
    schema: { radius: range('Blur', 4, 0, 120, 0.5) },
  },
  pixelate: {
    label: 'Pixelate',
    main: 'cells',
    schema: { cells: range('Pixelate', 40, 1, 240, 1, 'cells across') },
  },
  mono: { label: 'Mono', schema: {} },
  invert: { label: 'Invert', schema: {} },
  posterize: {
    label: 'Posterize',
    main: 'levels',
    schema: { levels: range('Posterize', 4, 2, 16, 1) },
  },
  threshold: {
    label: 'Threshold',
    main: 'level',
    schema: { level: range('Threshold', 0.5, 0.01, 1, 0.01) },
  },
  dither: {
    label: 'Dither',
    main: 'scale',
    schema: {
      scale: range('Dither', 2, 0.5, 12, 0.5, 'cell size'),
      ink: color('Dither', '#111111'),
      paper: color('Dither', '#f2f0eb'),
    },
  },
};

export const filterInputSchema = select(
  'Filter',
  'layer',
  [
    { value: 'layer', label: 'layer' },
    { value: 'background', label: 'background' },
  ],
  'applies to',
);

export const fillSpaceSchema = select(
  'Fill',
  'shape',
  [
    { value: 'shape', label: 'moves with shape' },
    { value: 'canvas', label: 'fixed to canvas' },
  ],
  'laid out',
);

export const brushSchema = {
  size: range('Brush', 60, 8, 300, 1),
  strength: range('Brush', 0.8, 0.05, 1, 0.01),
};

export const artworkSchema = {
  background: color('Artwork', '#e3e1dc', 'fill'),
  grain: range('Post', 0.04, 0, 0.4, 0.005),
  grainSize: range('Post', 1, 1, 6, 0.5, 'grain size'),
  vignette: range('Post', 0, 0, 1, 0.01),
};
