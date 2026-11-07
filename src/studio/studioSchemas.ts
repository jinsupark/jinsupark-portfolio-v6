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

export const frameSchema = {
  x: range('Transform', 0, -4000, 8000, 1),
  y: range('Transform', 0, -4000, 8000, 1),
  w: range('Transform', DESIGN.w, 1, 12000, 1, 'width'),
  h: range('Transform', DESIGN.h, 1, 12000, 1, 'height'),
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

// Outline effects, by type. `main` is the value shown in the effect's row.
export const OUTLINES: Record<
  string,
  { label: string; main: string; schema: Schema }
> = {
  tear: {
    label: 'Torn edge',
    main: 'amount',
    schema: {
      amount: range('Torn edge', 10, 0, 40, 0.1),
      scale: range('Torn edge', 0.06, 0.005, 0.5, 0.001, 'frequency'),
      seed: range('Torn edge', 1, 1, 999, 1),
    },
  },
  feather: {
    label: 'Feather',
    main: 'amount',
    schema: { amount: range('Feather', 8, 0, 120, 0.5) },
  },
};

export const strokeSchema = {
  width: range('Border', 2, 0.1, 80, 0.1),
  align: select(
    'Border',
    'center',
    [
      { value: 'inside', label: 'inside' },
      { value: 'center', label: 'centre' },
      { value: 'outside', label: 'outside' },
    ],
    'position',
  ),
  offset: range('Border', 0, -80, 80, 0.5),
  sides: select('Border', 'all', [
    { value: 'all', label: 'all' },
    { value: 'top', label: 'top' },
    { value: 'bottom', label: 'bottom' },
    { value: 'left', label: 'left' },
    { value: 'right', label: 'right' },
  ]),
  // Absent on borders from before joins, which drew round.
  join: select('Border', 'round', [
    { value: 'miter', label: 'miter' },
    { value: 'round', label: 'round' },
    { value: 'bevel', label: 'bevel' },
  ]),
  miterAngle: when(
    range('Border', 28.96, 1, 180, 0.01, 'miter angle'),
    (v) => v.join === 'miter',
  ),
};

// Effects by type, with the settings each has beyond its colour and opacity.
const shadowGeo = (group: string, x: number, y: number, blur: number) => ({
  x: range(group, x, -120, 120, 0.5, 'offset x'),
  y: range(group, y, -120, 120, 0.5, 'offset y'),
  blur: range(group, blur, 0, 160, 0.5),
  spread: range(group, 0, -60, 60, 0.5),
});
export const EFFECTS: Record<
  'drop' | 'inner' | 'fibres',
  { label: string; main: string; schema: Schema }
> = {
  drop: {
    label: 'Drop shadow',
    main: 'blur',
    schema: shadowGeo('Shadow', 6, 10, 14),
  },
  inner: {
    label: 'Inner shadow',
    main: 'blur',
    schema: shadowGeo('Shadow', 2, 4, 8),
  },
  fibres: {
    label: 'Paper fibres',
    main: 'width',
    schema: {
      width: range('Fibres', 12, 0.5, 80, 0.5),
      fibers: range('Fibres', 0.6, 0.01, 2, 0.01, 'wobble'),
      align: select(
        'Fibres',
        'inside',
        [
          { value: 'inside', label: 'inside' },
          { value: 'center', label: 'centre' },
          { value: 'outside', label: 'outside' },
        ],
        'position',
      ),
      offset: range('Fibres', 0, -80, 80, 0.5),
      sides: select('Fibres', 'all', [
        { value: 'all', label: 'all' },
        { value: 'top', label: 'top' },
        { value: 'bottom', label: 'bottom' },
        { value: 'left', label: 'left' },
        { value: 'right', label: 'right' },
      ]),
    },
  },
};

const BOOLEAN_OPS = [
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
  water: {
    label: 'Water',
    main: 'bend',
    schema: { bend: range('Water', 24, 0, 120, 0.5) },
  },
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
  grain: {
    label: 'Grain',
    main: 'amount',
    schema: {
      amount: range('Grain', 0.06, 0, 0.4, 0.005),
      size: range('Grain', 1, 1, 6, 0.5, 'grain size'),
    },
  },
  vignette: {
    label: 'Vignette',
    main: 'amount',
    schema: { amount: range('Vignette', 0.3, 0, 1, 0.01) },
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
  surround: color('Artwork', '#eeeeee', 'background'),
  background: color('Artwork', '#e3e1dc', 'canvas'),
};
