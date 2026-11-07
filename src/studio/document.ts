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

// A band along the shape's edge, painted with its own fills. Its `type` is
// a key of `STROKES` in `studioSchemas.ts`: a plain line, or paper fibres,
// whose width wobbles by `fibers` like a torn sheet's paper core.
export type StrokeDoc = {
  id: string;
  type: string;
  visible: boolean;
  width: number;
  align: 'inside' | 'center' | 'outside';
  // Moves the band outward (negative: inward), in design units.
  offset: number;
  // Which part of the outline it runs along: all of it, or the side facing
  // one way (split corner to corner, like Figma's per-side strokes).
  sides?: 'all' | 'top' | 'bottom' | 'left' | 'right';
  fibers: number;
  opacity: number;
  blend: BlendMode;
  fills: FillDoc[];
};

// A change to the outline itself (a tear, a feather). Everything follows the
// changed outline: fills, borders, shadows. Its `type` is a key of `OUTLINES`
// in `studioSchemas.ts`. Tears add up, so a coarse and a fine one stack.
export type OutlineDoc = {
  id: string;
  type: string;
  visible: boolean;
  values: Record<string, unknown>;
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
  // Locked layers can't be picked, boxed or moved on the canvas; select one
  // in the layer list to edit it.
  locked?: boolean;
  frame: Frame;
  opacity: number;
  blend: BlendMode;
  mask: Mask;
  // Bottom to top, each.
  fills: FillDoc[];
  filters: FilterDoc[];
  strokes: StrokeDoc[];
  shadows: ShadowDoc[];
  outline: OutlineDoc[];
  // The outline the fills are cut to. Absent is the whole frame.
  shape?: ShapeDoc;
  // Booleans with other layers' shapes, checked against `combineSchema`.
  combine?: Record<string, unknown>;
  // The folder this layer sits in, by `GroupDoc` id. A folder's layers are
  // kept next to each other in the stack. Folders don't change rendering.
  group?: string;
};

// A folder. Like a layer it can be blended, filtered, masked and shadowed as
// one: its layers are composited together first, then laid on what's below.
// A folder with none of that set is free; it only organises. Folders nest
// through `parent`, and every layer under a folder sits in one block of the
// stack.
export type GroupDoc = {
  id: string;
  name: string;
  parent?: string;
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
  blend?: BlendMode;
  filters?: FilterDoc[];
  shadows?: ShadowDoc[];
  mask?: Mask;
};

// The id a folder goes by in a selection, beside layer ids.
export const folderKey = (id: string) => `g:${id}`;
export const isFolderKey = (k: string) => k.startsWith('g:');

// A layer's folders, outermost first.
export function chainOf(d: Pick<Artwork, 'groups'>, l: LayerDoc): GroupDoc[] {
  const byId = new Map((d.groups ?? []).map((g) => [g.id, g]));
  const out: GroupDoc[] = [];
  const seen = new Set<string>();
  for (let g = l.group && byId.get(l.group); g && !seen.has(g.id);) {
    seen.add(g.id);
    out.unshift(g);
    g = g.parent ? byId.get(g.parent) : undefined;
  }
  return out;
}

// Every layer under a folder, nested ones included.
export const layersIn = (d: Artwork, groupId: string) =>
  d.layers.filter((l) => chainOf(d, l).some((g) => g.id === groupId));

// A selection's layers: folder keys stand for every layer under them.
export function layersOf(d: Artwork, keys: string[]): string[] {
  const out = new Set<string>();
  for (const k of keys)
    if (isFolderKey(k)) for (const l of layersIn(d, k.slice(2))) out.add(l.id);
    else out.add(k);
  return [...out];
}

// A folder with nothing set only organises, and costs nothing to draw.
export const plainFolder = (g: GroupDoc) =>
  (g.opacity ?? 1) === 1 &&
  (g.blend ?? 'normal') === 'normal' &&
  !g.filters?.some((f) => f.visible) &&
  !g.shadows?.some((s) => s.visible) &&
  !g.mask?.source;

export type Artwork = {
  version: number;
  slug: string;
  title: string;
  about: string;
  background: string;
  // Bottom to top.
  layers: LayerDoc[];
  groups?: GroupDoc[];
  // Export presets: each is the whole artwork at a scale of its design size.
  exports?: ExportDoc[];
  // The studio's background round the artwork (the artwork's own colour is
  // `background`, labelled Canvas); not part of the artwork itself.
  surround?: string;
  // The canvas in design units. Absent is `DESIGN` (800×1000, 4:5), which is
  // what every artwork saved before sizes existed was made at.
  size?: Size;
};

export type Size = { w: number; h: number };
export const sizeOf = (d: Pick<Artwork, 'size'>): Size => d.size ?? DESIGN;

// Canvas presets, long side 1000 design units (4:5 is the original 800×1000).
export const ASPECTS: { label: string; size: Size }[] = [
  { label: '4:5', size: { w: 800, h: 1000 } },
  { label: '1:1', size: { w: 1000, h: 1000 } },
  { label: '3:4', size: { w: 750, h: 1000 } },
  { label: '2:3', size: { w: 667, h: 1000 } },
  { label: '9:16', size: { w: 563, h: 1000 } },
  { label: '16:9', size: { w: 1000, h: 563 } },
  { label: '3:2', size: { w: 1000, h: 667 } },
];

// A new canvas size, with the layers staying where they are, like resizing a
// frame in Figma. A layer that filled the old canvas fills the new one.
export function resizeArtwork(d: Artwork, size: Size): Artwork {
  const old = sizeOf(d);
  const full = (f: Frame) =>
    f.x === 0 && f.y === 0 && f.w === old.w && f.h === old.h && f.rot === 0;
  return {
    ...d,
    size,
    layers: d.layers.map((l) =>
      full(l.frame) ? { ...l, frame: fullFrame(size) } : l,
    ),
  };
}

export type ExportDoc = {
  id: string;
  scale: number;
  format: 'png' | 'jpg' | 'mp4' | 'webm';
  // Video only: how long to record, in seconds.
  duration?: number;
};
export const isVideo = (e: ExportDoc) =>
  e.format === 'mp4' || e.format === 'webm';
export const DEFAULT_EXPORTS: ExportDoc[] = [
  { id: 'default', scale: 2, format: 'png' },
];

// The box round the frames as they sit on the artwork (rotation included),
// or null for none.
export function boundsOf(frames: Frame[]): Frame | null {
  if (!frames.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const f of frames) {
    const r = (f.rot * Math.PI) / 180;
    const w = Math.abs(f.w * Math.cos(r)) + Math.abs(f.h * Math.sin(r));
    const h = Math.abs(f.w * Math.sin(r)) + Math.abs(f.h * Math.cos(r));
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    x0 = Math.min(x0, cx - w / 2);
    y0 = Math.min(y0, cy - h / 2);
    x1 = Math.max(x1, cx + w / 2);
    y1 = Math.max(y1, cy + h / 2);
  }
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
// Put the selection in a new folder, inside the folders they share. A folder
// whose layers are all selected goes in whole (so folders nest); other layers
// move in on their own. They're gathered into one block where the topmost of
// them sits, in their stacking order.
export function groupLayers(d: Artwork, keys: string[], name: string): Artwork {
  const ids = new Set(layersOf(d, keys));
  if (!ids.size) return d;
  const id = layerId();
  const chains = d.layers
    .filter((l) => ids.has(l.id))
    .map((l) => chainOf(d, l));
  // The deepest folder every selected layer is inside.
  let common: GroupDoc | undefined;
  for (let i = 0; ; i++) {
    const g = chains[0][i];
    if (!g || chains.some((c) => c[i]?.id !== g.id)) break;
    common = g;
  }
  const depth = common
    ? chains[0].findIndex((g) => g.id === common!.id) + 1
    : 0;
  // Folders right under the common one, taken whole if all their layers are
  // selected.
  const whole = new Set<string>();
  for (const c of chains) {
    const g = c[depth];
    if (g && layersIn(d, g.id).every((l) => ids.has(l.id))) whole.add(g.id);
  }
  const top = Math.max(...d.layers.flatMap((l, i) => (ids.has(l.id) ? i : [])));
  const picked = d.layers
    .filter((l) => ids.has(l.id))
    .map((l) => {
      const g = chainOf(d, l)[depth];
      return g && whole.has(g.id) ? l : { ...l, group: id };
    });
  const rest = d.layers.filter((l) => !ids.has(l.id));
  const at = rest.length - (d.layers.length - 1 - top);
  rest.splice(at, 0, ...picked);
  return tidyGroups({
    ...d,
    layers: rest,
    groups: [
      ...(d.groups ?? []).map((g) =>
        whole.has(g.id) ? { ...g, parent: id } : g,
      ),
      { id, name, ...(common && { parent: common.id }) },
    ],
  });
}

// Take selected layers up out of their folder, or dissolve selected folders
// into their parent.
export function ungroupLayers(d: Artwork, keys: string[]): Artwork {
  const groups = d.groups ?? [];
  const byId = new Map(groups.map((g) => [g.id, g]));
  const gone = new Set(keys.filter(isFolderKey).map((k) => k.slice(2)));
  const up = (gid?: string) => {
    let g = gid ? byId.get(gid) : undefined;
    while (g && gone.has(g.id)) g = g.parent ? byId.get(g.parent) : undefined;
    return g?.id;
  };
  const set = new Set(keys);
  return tidyGroups({
    ...d,
    layers: d.layers.map((l) => {
      if (set.has(l.id))
        return { ...l, group: up(byId.get(l.group ?? '')?.parent) };
      return l.group && gone.has(l.group) ? { ...l, group: up(l.group) } : l;
    }),
    groups: groups
      .filter((g) => !gone.has(g.id))
      .map((g) =>
        g.parent && gone.has(g.parent) ? { ...g, parent: up(g.parent) } : g,
      ),
  });
}

// Drop folders with no layers under them, and links to folders that are gone.
export function tidyGroups(d: Artwork): Artwork {
  const all = d.groups ?? [];
  const byId = new Map(all.map((g) => [g.id, g]));
  const used = new Set<string>();
  for (const l of d.layers) {
    let g = l.group ? byId.get(l.group) : undefined;
    while (g && !used.has(g.id)) {
      used.add(g.id);
      g = g.parent ? byId.get(g.parent) : undefined;
    }
  }
  const groups = all
    .filter((g) => used.has(g.id))
    .map((g) =>
      g.parent && !used.has(g.parent) ? { ...g, parent: undefined } : g,
    );
  return {
    ...d,
    groups,
    layers: d.layers.map((l) =>
      l.group && !used.has(l.group) ? { ...l, group: undefined } : l,
    ),
  };
}

export const fullFrame = (size: Size = DESIGN): Frame => ({
  x: 0,
  y: 0,
  w: size.w,
  h: size.h,
  rot: 0,
});

export const newArtwork = (slug = 'untitled'): Artwork => ({
  version: DOC_VERSION,
  slug,
  title: 'Untitled',
  about: '',
  background: '#e3e1dc',
  layers: [],
});

export const layerId = () => Math.random().toString(36).slice(2, 9);

// A layer with nothing on it yet but `fills`.
export const newLayer = (
  name: string,
  frame: Frame,
  fills: FillDoc[],
  id = layerId(),
): LayerDoc => ({
  id,
  name,
  visible: true,
  frame,
  opacity: 1,
  blend: 'normal',
  mask: { source: null, mode: 'alpha', invert: false },
  fills,
  filters: [],
  strokes: [],
  shadows: [],
  outline: [],
});

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

const solidFill = (color: string, id = layerId()): FillDoc => ({
  id,
  type: 'solid',
  version: 2,
  values: { color },
  visible: true,
  opacity: 1,
  blend: 'normal',
});

export const newStroke = (type = 'line', id = layerId()): StrokeDoc => ({
  id,
  type,
  visible: true,
  width: type === 'fibres' ? 12 : 2,
  align: type === 'fibres' ? 'inside' : 'center',
  offset: 0,
  fibers: type === 'fibres' ? 0.6 : 0,
  opacity: 1,
  blend: 'normal',
  fills: [solidFill(type === 'fibres' ? '#f8f5ee' : '#111111', `${id}-fill`)],
});

export const newOutline = (
  type: string,
  values: Record<string, unknown>,
): OutlineDoc => ({ id: layerId(), type, visible: true, values });

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

// The fill a layer is named and listed by: its topmost one.
export const primaryFill = (l: LayerDoc) => l.fills.at(-1);

export const SLUG = /^[a-z0-9][a-z0-9-]*$/;
