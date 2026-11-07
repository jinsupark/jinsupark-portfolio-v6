import { useEffect, useRef, useState } from 'react';
import {
  Brush as BrushIcon,
  Circle,
  Hexagon,
  MousePointer2,
  Pencil,
  PenTool,
  RectangleHorizontal,
  Spline,
  Square,
  Star,
  Triangle,
  type LucideIcon,
} from 'lucide-react';
import { defaultsOf, type Schema } from '@/lab/controls';
import { type BlendMode, type LayerDoc } from './document';
import {
  contains,
  flatten,
  newShape,
  toLocal,
  verticesOf,
  type P,
  type ShapeDoc,
  type ShapeKind,
} from './shape';

export type Tool =
  | 'select'
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'polygon'
  | 'star'
  | 'pen'
  | 'bezier'
  | 'edit'
  | 'smear';

export const DRAW_TOOLS: Record<string, ShapeKind> = {
  rect: 'rect',
  ellipse: 'ellipse',
  triangle: 'polygon',
  polygon: 'polygon',
  star: 'star',
};

export type Brush = { size: number; strength: number };

// The toolbar, in its groups, with each tool's shortcut key.
export const TOOLS: {
  tool: Tool;
  key: string;
  label: string;
  icon: LucideIcon;
}[][] = [
  [{ tool: 'select', key: 'v', label: 'Select', icon: MousePointer2 }],
  [
    { tool: 'rect', key: 'r', label: 'Rectangle', icon: Square },
    { tool: 'ellipse', key: 'e', label: 'Ellipse', icon: Circle },
    { tool: 'triangle', key: 't', label: 'Triangle', icon: Triangle },
    { tool: 'polygon', key: 'g', label: 'Polygon', icon: Hexagon },
    { tool: 'star', key: 'k', label: 'Star', icon: Star },
  ],
  [
    { tool: 'bezier', key: 'p', label: 'Pen', icon: PenTool },
    { tool: 'pen', key: '⇧p', label: 'Pencil', icon: Pencil },
  ],
  [
    { tool: 'edit', key: 'a', label: 'Edit points', icon: Spline },
    { tool: 'smear', key: 's', label: 'Smear', icon: BrushIcon },
  ],
];

// What a layer's row shows it as: its outline's kind, or a plain frame.
export function kindIcon(l: LayerDoc): LucideIcon {
  const s = l.shape;
  if (!s) return RectangleHorizontal;
  if (s.kind === 'ellipse') return Circle;
  if (s.kind === 'polygon') return s.sides === 3 ? Triangle : Hexagon;
  if (s.kind === 'star') return Star;
  if (s.kind === 'path') return PenTool;
  return Square;
}

// Tool keys stand down while a field has focus.
export const typing = (e: KeyboardEvent) =>
  e.target instanceof Element && !!e.target.closest('input, textarea, select');

// A layer's outline as a shape, treating a plain frame as a rectangle.
export const shapeOf = (l: LayerDoc): ShapeDoc => l.shape ?? newShape('rect');

// The topmost visible layer whose outline holds artwork point `p`.
export function hitLayer(layers: LayerDoc[], p: P) {
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i];
    if (!l.visible || l.locked) continue;
    const q = toLocal(l.frame, p);
    const { w, h } = l.frame;
    if (q.x < 0 || q.y < 0 || q.x > w || q.y > h) continue;
    if (!l.shape || contains(flatten(verticesOf(l.shape, w, h), w, h, 400), q))
      return l;
  }
  return null;
}

// Where a popover opened from `el` goes: beside the panel or popover it was
// opened from, a few pixels off, level with `el` where the screen allows.
export const POPOVER_W = 264;
export function popoverAt(el: Element, width = POPOVER_W) {
  // Only a popover opened from inside another sits beside it; one opened
  // from the panel replaces whatever was open, so it takes the usual place.
  const nested = !!el.closest('[data-popover]');
  const r = el.getBoundingClientRect();
  const from = (
    el.closest('[data-popover]') ?? el.closest('aside')
  )?.getBoundingClientRect();
  const top = Math.max(8, Math.min(r.top - 8, innerHeight - 360));
  let left = (from?.left ?? r.left) - width - 4;
  // Beside any popover already open there, rather than on top of it.
  const open = nested
    ? [...document.querySelectorAll('[data-popover]')].map((p) =>
        p.getBoundingClientRect(),
      )
    : [];
  for (let moved = true; moved;) {
    moved = false;
    for (const o of open)
      if (left < o.right && left + width > o.left) {
        left = o.left - width - 4;
        moved = true;
      }
  }
  return { top, left: Math.max(8, left) };
}

// One popover at a time, as in Figma: opening one from the panel closes any
// other, in any list. One opened from inside a popover (a border's paint)
// sits beside it instead, and goes when its parent does.
const POPOVER_OPENED = 'studio:popover-opened';
export function announcePopover(owner: unknown) {
  dispatchEvent(new CustomEvent(POPOVER_OPENED, { detail: owner }));
}
export function useOnOtherPopover(owner: unknown, close: () => void) {
  const latest = useRef(close);
  useEffect(() => {
    latest.current = close;
  });
  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent).detail !== owner) latest.current();
    };
    addEventListener(POPOVER_OPENED, on);
    return () => removeEventListener(POPOVER_OPENED, on);
  }, [owner]);
}

// Which item of a list has its popover open (several only when they were
// opened from inside a popover).
export type At = { id: string; top: number; left: number };
export function usePopovers() {
  const [opens, setOpens] = useState<At[]>([]);
  const [me] = useState(() => ({}));
  useOnOtherPopover(me, () => setOpens([]));
  const isOpen = (id: string) => opens.some((o) => o.id === id);
  const openAt = (id: string, el: Element) => {
    const top = !el.closest('[data-popover]');
    if (top) announcePopover(me);
    setOpens((os) =>
      os.some((o) => o.id === id)
        ? os
        : [...(top ? [] : os), { id, ...popoverAt(el) }],
    );
  };
  const close = (id: string) => setOpens((os) => os.filter((o) => o.id !== id));
  const toggle = (id: string, el: Element) =>
    isOpen(id) ? close(id) : openAt(id, el);
  return { opens, isOpen, openAt, close, toggle };
}

// One group of a schema back to its defaults, the rest untouched.
export const resetGroup = (
  schema: Schema,
  values: Record<string, unknown>,
  group: string,
) => {
  const d = defaultsOf(schema);
  const next = { ...values };
  for (const k in schema) if (schema[k].group === group) next[k] = d[k];
  return next;
};

// Blend modes in Figma's groups: normal, darken, lighten, contrast,
// difference. '-' entries are the menu's separators.
const BLEND_GROUPS: (BlendMode | '-')[] = [
  'normal',
  '-',
  'darken',
  'multiply',
  'color-burn',
  '-',
  'lighten',
  'screen',
  'color-dodge',
  'add',
  '-',
  'overlay',
  'soft-light',
  'hard-light',
  '-',
  'difference',
  'exclusion',
];
export const blendOptions = BLEND_GROUPS.map((m) => ({
  value: m,
  label: m === '-' ? '' : m === 'add' ? 'plus lighter' : m.replace('-', ' '),
}));
