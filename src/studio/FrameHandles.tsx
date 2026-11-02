import { useRef } from 'react';
import { DESIGN, type Frame } from './document';

const SNAP = 8; // design units

// Snaps an edge to the artwork's edges and centre when it's within reach.
const snap = (v: number, targets: number[]) => {
  for (const t of targets) if (Math.abs(v - t) < SNAP) return t;
  return Math.round(v);
};
const xs = [0, DESIGN.w / 2, DESIGN.w];
const ys = [0, DESIGN.h / 2, DESIGN.h];

type Grip = 'move' | 'nw' | 'ne' | 'sw' | 'se';

// The selected layer's frame over the artwork: drag inside to move it, drag a
// corner to resize. Works in design units, so it holds at any display size.
export default function FrameHandles({
  frame,
  onChange,
}: {
  frame: Frame;
  onChange: (f: Frame) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    grip: Grip;
    x: number;
    y: number;
    unit: number;
    start: Frame;
  } | null>(null);

  const down = (e: React.PointerEvent, grip: Grip) => {
    e.stopPropagation();
    const box = el.current!.parentElement!.getBoundingClientRect();
    drag.current = {
      grip,
      x: e.clientX,
      y: e.clientY,
      unit: DESIGN.w / box.width,
      start: frame,
    };
    el.current!.setPointerCapture(e.pointerId);
  };

  const moveTo = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) * d.unit;
    const dy = (e.clientY - d.y) * d.unit;
    const s = d.start;
    if (d.grip === 'move') {
      let x = snap(s.x + dx, xs);
      let y = snap(s.y + dy, ys);
      // Let the far edge snap too.
      const xr = snap(s.x + dx + s.w, xs);
      const yb = snap(s.y + dy + s.h, ys);
      if (x === Math.round(s.x + dx)) x = xr - s.w;
      if (y === Math.round(s.y + dy)) y = yb - s.h;
      onChange({ ...s, x, y });
      return;
    }
    let { x: x0, y: y0 } = s;
    let x1 = s.x + s.w;
    let y1 = s.y + s.h;
    if (d.grip.includes('w')) x0 = snap(x0 + dx, xs);
    else x1 = snap(x1 + dx, xs);
    if (d.grip.includes('n')) y0 = snap(y0 + dy, ys);
    else y1 = snap(y1 + dy, ys);
    onChange({
      ...s,
      x: Math.min(x0, x1 - 1),
      y: Math.min(y0, y1 - 1),
      w: Math.max(1, x1 - x0),
      h: Math.max(1, y1 - y0),
    });
  };

  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div
      ref={el}
      onPointerDown={(e) => down(e, 'move')}
      onPointerMove={moveTo}
      onPointerUp={() => (drag.current = null)}
      className="absolute cursor-move outline outline-1 outline-sky-400/90"
      style={{
        left: pct(frame.x, DESIGN.w),
        top: pct(frame.y, DESIGN.h),
        width: pct(frame.w, DESIGN.w),
        height: pct(frame.h, DESIGN.h),
        transform: `rotate(${frame.rot}deg)`,
      }}
    >
      {(['nw', 'ne', 'sw', 'se'] as const).map((g) => (
        <span
          key={g}
          onPointerDown={(e) => down(e, g)}
          className="absolute size-2.5 -translate-1/2 border border-sky-400 bg-neutral-900"
          style={{
            left: g.includes('w') ? 0 : '100%',
            top: g.includes('n') ? 0 : '100%',
            cursor: g === 'nw' || g === 'se' ? 'nwse-resize' : 'nesw-resize',
          }}
        />
      ))}
    </div>
  );
}
