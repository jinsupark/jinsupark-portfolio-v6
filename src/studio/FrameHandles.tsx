import { useRef, useState } from 'react';
import { DESIGN, type Frame, type Size } from './document';

const SNAP = 8; // design units

// Snaps an edge to the artwork's edges and centre when it's within reach.
const snap = (v: number, targets: number[]) => {
  for (const t of targets) if (Math.abs(v - t) < SNAP) return t;
  return Math.round(v);
};

type Grip = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'rot';

// The rotate cursor: a quarter-circle arrow with a head at each end, like
// Figma's, white-edged so it reads on any colour, and turned to wrap round
// the corner it's at.
const ARC_PATH = 'M8.5 17.5 A9 9 0 0 1 17.5 8.5';
const HEADS = 'M4.5 15 L12.5 15 L8.5 20.5 Z M15 4.5 L15 12.5 L20.5 8.5 Z';
const rotateCursor = (deg: number) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g transform="rotate(${deg} 12 12)"><path d="${ARC_PATH}" fill="none" stroke="white" stroke-width="5" stroke-linecap="round"/><path d="${HEADS}" fill="white" stroke="white" stroke-width="2.4" stroke-linejoin="round"/><path d="${ARC_PATH}" fill="none" stroke="black" stroke-width="2"/><path d="${HEADS}" fill="black"/></g></svg>`,
  )}") 12 12, crosshair`;
const ROTATE_CURSORS = {
  nw: rotateCursor(0),
  ne: rotateCursor(90),
  se: rotateCursor(180),
  sw: rotateCursor(270),
};

// The selected layer's frame over the artwork: drag inside to move it, drag a
// corner to resize. Works in design units, so it holds at any display size.
export default function FrameHandles({
  frame,
  onChange,
  onShiftClick,
  size = DESIGN,
  rotatable = false,
  onDuplicate,
}: {
  frame: Frame;
  onChange: (f: Frame) => void;
  // A shift-click inside the box, at that artwork point, so it can add or
  // drop the layer under the pointer instead of starting a move.
  onShiftClick?: (p: { x: number; y: number }) => void;
  size?: Size;
  // Offer the rotate zones (a single layer; a selection's box doesn't turn).
  rotatable?: boolean;
  // Option-drag: copy what's selected in place and carry the copies.
  onDuplicate?: () => void;
}) {
  const xs = [0, size.w / 2, size.w];
  const ys = [0, size.h / 2, size.h];
  const el = useRef<HTMLDivElement>(null);
  // Showing the size while a corner is dragged.
  const [sizing, setSizing] = useState<'size' | 'rot' | null>(null);
  const drag = useRef<{
    grip: Grip;
    x: number;
    y: number;
    unit: number;
    start: Frame;
    // Rotating: the frame's centre on screen and the pointer's starting angle.
    cx?: number;
    cy?: number;
    a0?: number;
  } | null>(null);

  const down = (e: React.PointerEvent, grip: Grip) => {
    e.stopPropagation();
    const box = el.current!.parentElement!.getBoundingClientRect();
    if (grip === 'move' && e.shiftKey) {
      onShiftClick?.({
        x: ((e.clientX - box.left) / box.width) * size.w,
        y: ((e.clientY - box.top) / box.height) * size.h,
      });
      return;
    }
    if (grip === 'move' && e.altKey) onDuplicate?.();
    const r = el.current!.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    drag.current = {
      grip,
      x: e.clientX,
      y: e.clientY,
      unit: size.w / box.width,
      start: frame,
      cx,
      cy,
      a0: Math.atan2(e.clientY - cy, e.clientX - cx),
    };
    setSizing(grip === 'move' ? null : grip === 'rot' ? 'rot' : 'size');
    el.current!.setPointerCapture(e.pointerId);
  };

  const moveTo = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) * d.unit;
    const dy = (e.clientY - d.y) * d.unit;
    const s = d.start;
    if (d.grip === 'rot') {
      const a = Math.atan2(e.clientY - d.cy!, e.clientX - d.cx!);
      let rot = s.rot + ((a - d.a0!) * 180) / Math.PI;
      if (e.shiftKey) rot = Math.round(rot / 15) * 15;
      rot = ((((rot + 180) % 360) + 360) % 360) - 180;
      onChange({ ...s, rot: Math.round(rot * 10) / 10 });
      return;
    }
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
      onPointerUp={() => {
        drag.current = null;
        setSizing(null);
      }}
      className="pointer-events-none absolute outline outline-1 outline-sky-500"
      style={{
        left: pct(frame.x, size.w),
        top: pct(frame.y, size.h),
        width: pct(frame.w, size.w),
        height: pct(frame.h, size.h),
        transform: `rotate(${frame.rot}deg)`,
      }}
    >
      {sizing && (
        <span className="pointer-events-none absolute top-full left-1/2 mt-2 -translate-x-1/2 rounded-md bg-sky-500 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-[#fff] tabular-nums">
          {sizing === 'rot'
            ? `${Math.round(frame.rot)}°`
            : `${Math.round(frame.w)} × ${Math.round(frame.h)}`}
        </span>
      )}
      {rotatable &&
        (['nw', 'ne', 'sw', 'se'] as const).map((g) => (
          <span
            key={`rot-${g}`}
            onPointerDown={(e) => down(e, 'rot')}
            className="pointer-events-auto absolute size-4"
            style={{
              left: g.includes('w') ? 0 : '100%',
              top: g.includes('n') ? 0 : '100%',
              transform: `translate(${g.includes('w') ? '-100%' : '0'}, ${g.includes('n') ? '-100%' : '0'})`,
              cursor: ROTATE_CURSORS[g],
            }}
          />
        ))}
      {(['nw', 'ne', 'sw', 'se'] as const).map((g) => (
        <span
          key={g}
          onPointerDown={(e) => down(e, g)}
          className="pointer-events-auto absolute size-2.5 -translate-1/2 rounded-[2px] border border-sky-500 bg-[#fff]"
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
