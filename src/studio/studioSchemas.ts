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

const dithered = (v: Record<string, unknown>) => !!v.dither;
export const fxSchema = {
  pixelate: range('Filters', 0, 0, 240, 1, 'pixelate cells'),
  mono: toggle('Filters', false),
  invert: toggle('Filters', false),
  posterize: range('Filters', 0, 0, 16, 1, 'posterize levels'),
  threshold: range('Filters', 0, 0, 1, 0.01),
  dither: toggle('Filters', false),
  ditherScale: when(range('Filters', 2, 0.5, 12, 0.5, 'dither cell'), dithered),
  ink: when(color('Filters', '#111111', 'dither ink'), dithered),
  paper: when(color('Filters', '#f2f0eb', 'dither paper'), dithered),
};

// The shader filling a layer, and where it's laid out.
export const shaderSchema = (types: Record<string, { label: string }>) => ({
  type: select(
    'Shader',
    'solid',
    Object.entries(types).map(([value, t]) => ({
      value,
      label: value.startsWith('local/') ? `${t.label} (this artwork)` : t.label,
    })),
    'shader',
  ),
  fillSpace: select(
    'Shader',
    'shape',
    [
      { value: 'shape', label: 'moves with shape' },
      { value: 'canvas', label: 'fixed to canvas' },
    ],
    'laid out',
  ),
});

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

// Every border treatment works off the shape's distance field, so they stack:
// a tear moves the edge, the core is a paper band inside it, the stroke
// follows the torn edge, and the shadow is the whole torn shape offset.
export const edgeSchema = {
  tear: range('Edge', 0, 0, 40, 0.1, 'torn edge'),
  tearScale: when(
    range('Edge', 0.06, 0.005, 0.5, 0.001, 'tear frequency'),
    on('tear'),
  ),
  seed: when(range('Edge', 1, 1, 999, 1, 'tear seed'), on('tear')),
  core: range('Edge', 0, 0, 40, 0.1, 'paper core'),
  fibers: when(range('Edge', 0.6, 0, 2, 0.01, 'core fibres'), on('core')),
  coreColor: when(color('Edge', '#f8f5ee', 'core colour'), on('core')),
  stroke: range('Edge', 0, 0, 40, 0.1),
  strokeAlign: when(
    select(
      'Edge',
      'center',
      [
        { value: 'inside', label: 'inside' },
        { value: 'center', label: 'centre' },
        { value: 'outside', label: 'outside' },
      ],
      'stroke position',
    ),
    on('stroke'),
  ),
  strokeColor: when(color('Edge', '#111111', 'stroke colour'), on('stroke')),
  feather: range('Edge', 0, 0, 120, 0.5),
  shadow: range('Shadow', 0, 0, 1, 0.01, 'strength'),
  shadowX: when(range('Shadow', 6, -120, 120, 0.5, 'offset x'), on('shadow')),
  shadowY: when(range('Shadow', 10, -120, 120, 0.5, 'offset y'), on('shadow')),
  shadowBlur: when(range('Shadow', 14, 0, 160, 0.5, 'blur'), on('shadow')),
  shadowColor: when(color('Shadow', '#1a1712', 'colour'), on('shadow')),
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

export const brushSchema = {
  size: range('Brush', 60, 8, 300, 1),
  strength: range('Brush', 0.8, 0.05, 1, 0.01),
};

export const artworkSchema = {
  background: color('Artwork', '#e3e1dc'),
  grain: range('Post', 0.04, 0, 0.4, 0.005),
  grainSize: range('Post', 1, 1, 6, 0.5, 'grain size'),
  vignette: range('Post', 0, 0, 1, 0.01),
};
