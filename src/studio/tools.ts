import {
  Brush as BrushIcon,
  Circle,
  Hexagon,
  MousePointer2,
  PenTool,
  RectangleHorizontal,
  Spline,
  Square,
  Star,
  Triangle,
  type LucideIcon,
} from 'lucide-react';
import type { LayerDoc } from './document';
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
  [{ tool: 'pen', key: 'p', label: 'Draw', icon: PenTool }],
  [
    { tool: 'edit', key: 'a', label: 'Edit points', icon: Spline },
    { tool: 'smear', key: 's', label: 'Smear', icon: BrushIcon },
  ],
];

export const TOOL_HINTS: Record<Tool, string> = {
  select: 'click a shape to select · drag to move · corners resize',
  rect: 'drag to draw · shift for a square · click for a default size',
  ellipse: 'drag to draw · shift for a circle',
  triangle: 'drag to draw',
  polygon: 'drag to draw · sides in the inspector',
  star: 'drag to draw · points in the inspector',
  pen: 'draw a closed shape freehand',
  edit: 'drag points and handles · double-click the outline to add · alt-click a point for corner / smooth · delete removes',
  smear: 'drag across the outline to push it',
};

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
    if (!l.visible) continue;
    const q = toLocal(l.frame, p);
    const { w, h } = l.frame;
    if (q.x < 0 || q.y < 0 || q.x > w || q.y > h) continue;
    if (!l.shape || contains(flatten(verticesOf(l.shape, w, h), w, h, 400), q))
      return l;
  }
  return null;
}
