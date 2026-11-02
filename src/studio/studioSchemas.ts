import { color, range, select, toggle, type Schema } from '@/lab/controls';
import { BLEND_MODES, DESIGN, type LayerDoc } from './document';
import type { ShapeKind } from './shape';

// The inspector shows a layer's placement, compositing and filters through the
// same control rows as a layer's own settings, so each gets a small schema.

export const frameSchema = {
  x: range('Frame', 0, -DESIGN.w, DESIGN.w * 2, 1),
  y: range('Frame', 0, -DESIGN.h, DESIGN.h * 2, 1),
  w: range('Frame', DESIGN.w, 1, DESIGN.w * 3, 1, 'width'),
  h: range('Frame', DESIGN.h, 1, DESIGN.h * 3, 1, 'height'),
  rot: range('Frame', 0, -180, 180, 0.5, 'rotate °'),
};

export const compositeSchema = {
  opacity: range('Composite', 1, 0, 1, 0.01),
  blend: select(
    'Composite',
    'normal',
    BLEND_MODES.map((m) => ({ value: m, label: m })),
  ),
};

export const maskSchema = (layer: LayerDoc, layers: LayerDoc[]): Schema => ({
  source: select('Mask', layer.mask.source ?? '', [
    { value: '', label: 'none' },
    ...layers
      .filter((l) => l.id !== layer.id)
      .map((l) => ({ value: l.id, label: l.name })),
  ]),
  mode: select('Mask', 'alpha', [
    { value: 'alpha', label: 'alpha' },
    { value: 'luma', label: 'luminance' },
  ]),
  invert: toggle('Mask', false),
});

export const fxSchema = {
  pixelate: range('Filters', 0, 0, 240, 1, 'pixelate cells'),
  mono: toggle('Filters', false),
  invert: toggle('Filters', false),
  posterize: range('Filters', 0, 0, 16, 1, 'posterize'),
  threshold: range('Filters', 0, 0, 1, 0.01),
  dither: toggle('Filters', false),
  ditherScale: range('Filters', 2, 0.5, 12, 0.5, 'dither cell'),
  ink: color('Filters', '#111111', 'dither ink'),
  paper: color('Filters', '#f2f0eb', 'dither paper'),
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
  tear: range('Edge', 0, 0, 40, 0.1, 'tear / roughen'),
  tearScale: range('Edge', 0.06, 0.005, 0.5, 0.001, 'tear frequency'),
  core: range('Edge', 0, 0, 40, 0.1, 'paper core'),
  fibers: range('Edge', 0.6, 0, 2, 0.01, 'core fibres'),
  coreColor: color('Edge', '#f8f5ee', 'core colour'),
  stroke: range('Edge', 0, 0, 40, 0.1, 'stroke'),
  strokeAlign: select('Edge', 'center', [
    { value: 'inside', label: 'inside' },
    { value: 'center', label: 'centre' },
    { value: 'outside', label: 'outside' },
  ]),
  strokeColor: color('Edge', '#111111', 'stroke colour'),
  feather: range('Edge', 0, 0, 120, 0.5),
  seed: range('Edge', 1, 1, 999, 1, 'tear seed'),
  shadow: range('Shadow', 0, 0, 1, 0.01),
  shadowX: range('Shadow', 6, -120, 120, 0.5, 'offset x'),
  shadowY: range('Shadow', 10, -120, 120, 0.5, 'offset y'),
  shadowBlur: range('Shadow', 14, 0, 160, 0.5, 'blur'),
  shadowColor: color('Shadow', '#1a1712', 'colour'),
};

export const BOOLEAN_OPS = [
  { value: 'none', label: 'none' },
  { value: 'union', label: 'unify' },
  { value: 'intersect', label: 'intersect' },
  { value: 'subtract', label: 'subtract' },
  { value: 'exclude', label: 'exclude' },
];

// Up to three other layers' shapes folded into this one, in order. The fill
// and every edge effect apply to the result.
export const combineSchema = (layer: LayerDoc, layers: LayerDoc[]): Schema => {
  const others = [
    { value: '', label: '—' },
    ...layers
      .filter((l) => l.id !== layer.id)
      .map((l) => ({ value: l.id, label: l.name })),
  ];
  const s: Schema = {};
  for (const k of [1, 2, 3]) {
    s[`op${k}`] = select('Combine', 'none', BOOLEAN_OPS, `${k}. operation`);
    s[`with${k}`] = select('Combine', '', others, `${k}. with`);
  }
  s.smooth = range('Combine', 0, 0, 120, 0.5, 'smooth join');
  return s;
};

export const artworkSchema = {
  background: color('Artwork', '#e3e1dc'),
  grain: range('Post', 0.04, 0, 0.4, 0.005),
  grainSize: range('Post', 1, 1, 6, 0.5, 'grain size'),
  vignette: range('Post', 0, 0, 1, 0.01),
};
