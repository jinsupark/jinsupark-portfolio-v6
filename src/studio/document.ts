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

// One entry in a layer's fill stack: a pixel-making layer type (`solid`,
// `grid`, `local/<name>`…) with its values.
export type FillDoc = {
  id: string;
  type: string;
  // The type's version when the values were saved, so a later change to
  // that type can be noticed rather than silently re-rendering.
  version?: number;
  values: Record<string, unknown>;
  visible: boolean;
  opacity: number;
  blend: BlendMode;
  // Laid out in the shape's frame and moving with it, or across the whole
  // artwork so the shape is a window onto it.
  fillSpace?: 'shape' | 'canvas';
  // Drafts from when effects were fills: read as a filter's input.
  input?: 'below' | 'behind';
};

// A filter changes pixels: the layer's fills (before the shape is cut, so the
// edge stays crisp), or the artwork behind the layer, shown inside its shape.
export type FilterDoc = {
  id: string;
  // A key of `FILTERS` in `studioSchemas.ts`: pixelate, blur, mono…
  type: string;
  visible: boolean;
  values: Record<string, unknown>;
  input: 'layer' | 'background';
};

// A band along the shape's edge, painted with its own fills. `fibers`
// wobbles its width like a torn sheet's paper core.
export type StrokeDoc = {
  id: string;
  visible: boolean;
  width: number;
  align: 'inside' | 'center' | 'outside';
  // Moves the band outward (negative: inward), in design units.
  offset: number;
  fibers: number;
  opacity: number;
  blend: BlendMode;
  fills: FillDoc[];
};

// The shape, offset and softened, laid under the layer.
export type ShadowDoc = {
  id: string;
  visible: boolean;
  x: number;
  y: number;
  blur: number;
  color: string;
  opacity: number;
};

export type LayerDoc = {
  id: string;
  name: string;
  visible: boolean;
  frame: Frame;
  opacity: number;
  blend: BlendMode;
  mask: Mask;
  // Bottom to top. Absent on layers saved before they existed; `fillsOf`,
  // `filtersOf`, `strokesOf` and `shadowsOf` read those from older fields.
  fills?: FillDoc[];
  filters?: FilterDoc[];
  strokes?: StrokeDoc[];
  shadows?: ShadowDoc[];
  // Before fills: one pixel-making type, its values and filters.
  type?: string;
  version?: number;
  values?: Record<string, unknown>;
  fx?: LayerFx;
  fillSpace?: 'shape' | 'canvas';
  // The outline the fills are cut to. Absent is the whole frame.
  shape?: ShapeDoc;
  // Changes to the outline itself (tear, feather) and booleans, each checked
  // against its schema in `studioSchemas.ts` (`edgeSchema`, `combineSchema`).
  // Older layers also kept their paper core, stroke and shadow here.
  edge?: Record<string, unknown>;
  combine?: Record<string, unknown>;
  // The folder this layer sits in, by `GroupDoc` id. A folder's layers are
  // kept next to each other in the stack. Folders don't change rendering.
  group?: string;
};

export type GroupDoc = { id: string; name: string };

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
  groups?: GroupDoc[];
  post: Post;
  // Export presets: each is the whole artwork at a scale of its design size.
  exports?: ExportDoc[];
};

export type ExportDoc = { id: string; scale: number; format: 'png' | 'jpg' };
export const DEFAULT_EXPORTS: ExportDoc[] = [
  { id: 'default', scale: 2, format: 'png' },
];

// The union of the frames' unrotated boxes, or null for none.
export function boundsOf(frames: Frame[]): Frame | null {
  if (!frames.length) return null;
  const x0 = Math.min(...frames.map((f) => f.x));
  const y0 = Math.min(...frames.map((f) => f.y));
  const x1 = Math.max(...frames.map((f) => f.x + f.w));
  const y1 = Math.max(...frames.map((f) => f.y + f.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, rot: 0 };
}

// A frame carried along when its group's box goes from `from` to `to`.
export function remap(f: Frame, from: Frame, to: Frame): Frame {
  const sx = to.w / from.w;
  const sy = to.h / from.h;
  return {
    ...f,
    x: to.x + (f.x - from.x) * sx,
    y: to.y + (f.y - from.y) * sy,
    w: Math.max(1, f.w * sx),
    h: Math.max(1, f.h * sy),
  };
}

// Put `ids` in a new folder, gathered into one block where the topmost of
// them sits, in their stacking order.
export function groupLayers(d: Artwork, ids: string[], name: string): Artwork {
  const set = new Set(ids);
  const id = layerId();
  const top = Math.max(...d.layers.flatMap((l, i) => (set.has(l.id) ? i : [])));
  const picked = d.layers.filter((l) => set.has(l.id));
  const rest = d.layers.filter((l) => !set.has(l.id));
  const at = rest.length - (d.layers.length - 1 - top);
  rest.splice(at, 0, ...picked.map((l) => ({ ...l, group: id })));
  return tidyGroups({
    ...d,
    layers: rest,
    groups: [...(d.groups ?? []), { id, name }],
  });
}

export function ungroupLayers(d: Artwork, ids: string[]): Artwork {
  const set = new Set(ids);
  return tidyGroups({
    ...d,
    layers: d.layers.map((l) =>
      set.has(l.id) ? { ...l, group: undefined } : l,
    ),
  });
}

// Drop folders with no layers left, and memberships of folders that are gone.
export function tidyGroups(d: Artwork): Artwork {
  const used = new Set(d.layers.map((l) => l.group));
  const groups = (d.groups ?? []).filter((g) => used.has(g.id));
  const known = new Set(groups.map((g) => g.id));
  return {
    ...d,
    groups,
    layers: d.layers.map((l) =>
      l.group && !known.has(l.group) ? { ...l, group: undefined } : l,
    ),
  };
}

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

export const newFill = (
  type: string,
  values: Record<string, unknown>,
  version?: number,
): FillDoc => ({
  id: layerId(),
  type,
  ...(version !== undefined && { version }),
  values,
  visible: true,
  opacity: 1,
  blend: 'normal',
});

export const solidFill = (color: string, id = layerId()): FillDoc => ({
  id,
  type: 'solid',
  version: 1,
  values: { color, gradient: false, color2: '#fcdbe5', angle: 90 },
  visible: true,
  opacity: 1,
  blend: 'normal',
});

export const newStroke = (id = layerId()): StrokeDoc => ({
  id,
  visible: true,
  width: 2,
  align: 'center',
  offset: 0,
  fibers: 0,
  opacity: 1,
  blend: 'normal',
  fills: [solidFill('#111111', `${id}-fill`)],
});

export const newShadow = (): ShadowDoc => ({
  id: layerId(),
  visible: true,
  x: 6,
  y: 10,
  blur: 14,
  color: '#1a1712',
  opacity: 0.5,
});

export const newFilter = (
  type: string,
  values: Record<string, unknown>,
): FilterDoc => ({
  id: layerId(),
  type,
  visible: true,
  values,
  input: 'layer',
});

// Defaults of the edge fields older layers used, so they read as they did.
const OLD_EDGE = {
  core: 0,
  fibers: 0.6,
  coreColor: '#f8f5ee',
  stroke: 0,
  strokeAlign: 'center',
  strokeColor: '#111111',
  shadow: 0,
  shadowX: 6,
  shadowY: 10,
  shadowBlur: 14,
  shadowColor: '#1a1712',
};
const oldEdge = (l: LayerDoc) =>
  ({ ...OLD_EDGE, ...l.edge }) as typeof OLD_EDGE & Record<string, unknown>;

function memo<T>(f: (l: LayerDoc) => T) {
  const cache = new WeakMap<LayerDoc, T>();
  return (l: LayerDoc): T => {
    let v = cache.get(l);
    if (v === undefined) cache.set(l, (v = f(l)));
    return v;
  };
}

const isOldEffect = (f: FillDoc) => f.type.startsWith('fx/');

// The layer's fills. One saved before fills existed has its type as one.
export const fillsOf = memo((l): FillDoc[] =>
  l.fills
    ? l.fills.filter((f) => !isOldEffect(f))
    : [
        {
          id: `${l.id}-fill`,
          type: l.type ?? 'solid',
          version: l.version,
          values: l.values ?? {},
          visible: true,
          opacity: 1,
          blend: 'normal',
          ...(l.fillSpace && { fillSpace: l.fillSpace }),
        },
      ],
);

// The layer's filters. Older layers' fixed filters become these in the order
// the old layer pass ran them; drafts from when effects were fills move here.
export const filtersOf = memo((l): FilterDoc[] => {
  if (l.filters) return l.filters;
  if (l.fills)
    return l.fills.filter(isOldEffect).map((f) => ({
      id: f.id,
      type: f.type.slice(3),
      visible: f.visible,
      values: f.values,
      input: f.input === 'behind' ? 'background' : 'layer',
    }));
  const fx = { ...NO_FX, ...l.fx };
  const f = (type: string, values: Record<string, unknown> = {}) => ({
    id: `${l.id}-${type}`,
    type,
    visible: true,
    values,
    input: 'layer' as const,
  });
  return [
    ...(fx.pixelate > 0 ? [f('pixelate', { cells: fx.pixelate })] : []),
    ...(fx.mono ? [f('mono')] : []),
    ...(fx.invert ? [f('invert')] : []),
    ...(fx.posterize > 0 ? [f('posterize', { levels: fx.posterize })] : []),
    ...(fx.threshold > 0 ? [f('threshold', { level: fx.threshold })] : []),
    ...(fx.dither
      ? [f('dither', { scale: fx.ditherScale, ink: fx.ink, paper: fx.paper })]
      : []),
  ];
});

// The layer's strokes. An older layer's paper core is an inside stroke with
// fibres, under its stroke, as the old layer pass drew them.
export const strokesOf = memo((l): StrokeDoc[] => {
  if (l.strokes) return l.strokes;
  const e = oldEdge(l);
  const out: StrokeDoc[] = [];
  if (Number(e.core) > 0)
    out.push({
      ...newStroke(`${l.id}-core`),
      width: Number(e.core),
      align: 'inside',
      fibers: Number(e.fibers),
      fills: [solidFill(String(e.coreColor), `${l.id}-core-fill`)],
    });
  if (Number(e.stroke) > 0)
    out.push({
      ...newStroke(`${l.id}-stroke`),
      width: Number(e.stroke),
      align: e.strokeAlign as StrokeDoc['align'],
      fills: [solidFill(String(e.strokeColor), `${l.id}-stroke-fill`)],
    });
  return out;
});

export const shadowsOf = memo((l): ShadowDoc[] => {
  if (l.shadows) return l.shadows;
  const e = oldEdge(l);
  return Number(e.shadow) > 0
    ? [
        {
          id: `${l.id}-shadow`,
          visible: true,
          x: Number(e.shadowX),
          y: Number(e.shadowY),
          blur: Number(e.shadowBlur),
          color: String(e.shadowColor),
          opacity: Number(e.shadow),
        },
      ]
    : [];
});

// A layer in today's form, with none of the fields its lists replaced.
export function upgradeLayer(l: LayerDoc): LayerDoc {
  const out: LayerDoc = {
    ...l,
    fills: fillsOf(l),
    filters: filtersOf(l),
    strokes: strokesOf(l),
    shadows: shadowsOf(l),
  };
  for (const k of ['type', 'version', 'values', 'fx', 'fillSpace'] as const)
    delete out[k];
  if (l.edge) {
    const edge = { ...l.edge };
    for (const k of Object.keys(OLD_EDGE)) delete edge[k];
    out.edge = edge;
  }
  return out;
}
export const upgrade = (d: Artwork): Artwork => ({
  ...d,
  layers: d.layers.map(upgradeLayer),
});

// The fill a layer is named and listed by: its topmost one.
export const primaryFill = (l: LayerDoc) => fillsOf(l).at(-1);

export const SLUG = /^[a-z0-9][a-z0-9-]*$/;
