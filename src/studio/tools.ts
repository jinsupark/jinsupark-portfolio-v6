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
