// Smart guides, as in Figma and Paper: while a box is dragged or resized,
// its edges and centre snap to other layers' and the canvas's, and a red line
// shows each alignment, running across the boxes it lines up.

export type Box = { x: number; y: number; w: number; h: number };
export type Guide = { x1: number; y1: number; x2: number; y2: number };

const lines = (b: Box, axis: 'x' | 'y') =>
  axis === 'x'
    ? [b.x, b.x + b.w / 2, b.x + b.w]
    : [b.y, b.y + b.h / 2, b.y + b.h];

// The nearest alignment on one axis within `tol`: how far to shift, and the
// line it lands on.
function nearest(
  own: number[],
  targets: Box[],
  axis: 'x' | 'y',
  tol: number,
): { shift: number; at: number } | null {
  let best: { shift: number; at: number } | null = null;
  for (const t of targets)
    for (const v of lines(t, axis))
      for (const m of own) {
        const shift = v - m;
        if (
          Math.abs(shift) <= tol &&
          (!best || Math.abs(shift) < Math.abs(best.shift))
        )
          best = { shift, at: v };
      }
  return best;
}

// Red lines where `box` lines up with the targets: every edge or centre of it
// that sits on one of theirs, drawn across all the boxes that share it.
export function guidesFor(box: Box, targets: Box[], eps = 0.5): Guide[] {
  const out: Guide[] = [];
  for (const axis of ['x', 'y'] as const) {
    for (const v of lines(box, axis)) {
      const hits = targets.filter((t) =>
        lines(t, axis).some((u) => Math.abs(u - v) <= eps),
      );
      if (!hits.length) continue;
      const all = [box, ...hits];
      if (axis === 'x') {
        const y1 = Math.min(...all.map((b) => b.y));
        const y2 = Math.max(...all.map((b) => b.y + b.h));
        out.push({ x1: v, y1, x2: v, y2 });
      } else {
        const x1 = Math.min(...all.map((b) => b.x));
        const x2 = Math.max(...all.map((b) => b.x + b.w));
        out.push({ x1, y1: v, x2, y2: v });
      }
    }
  }
  return out;
}

// A box being moved: how far to nudge it so an edge or centre lands on a
// target's (within `tol` design units), and the guides once it has.
export function snapMove(box: Box, targets: Box[], tol: number) {
  const sx = nearest(lines(box, 'x'), targets, 'x', tol);
  const sy = nearest(lines(box, 'y'), targets, 'y', tol);
  const dx = sx?.shift ?? 0;
  const dy = sy?.shift ?? 0;
  const moved = { ...box, x: box.x + dx, y: box.y + dy };
  return { dx, dy, guides: guidesFor(moved, targets) };
}

// One edge being resized: where it snaps to (within `tol`), or itself.
export function snapEdge(
  v: number,
  targets: Box[],
  axis: 'x' | 'y',
  tol: number,
) {
  const s = nearest([v], targets, axis, tol);
  return s ? v + s.shift : v;
}

// The canvas as a target: its edges and centre.
export const canvasBox = (size: { w: number; h: number }): Box => ({
  x: 0,
  y: 0,
  w: size.w,
  h: size.h,
});
