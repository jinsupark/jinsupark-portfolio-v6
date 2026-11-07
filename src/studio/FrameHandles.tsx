import { useRef, useState } from 'react';
import { boundsOf, DESIGN, type Frame, type Size } from './document';
import {
  canvasBox,
  guidesFor,
  snapEdge,
  snapMove,
  type Box,
  type Guide,
} from './snapping';

// How near, in screen pixels, an edge has to come to snap.
const SNAP_PX = 6;

type Grip = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | 'rot';

// A side's resize cursor, turned with the frame: `base` 0 for top and
// bottom, 90 for left and right.
function edgeCursor(base: number, rot: number) {
  const a = (((base + rot) % 180) + 180) % 180;
  return a < 22.5 || a >= 157.5
    ? 'ns-resize'
    : a < 67.5
      ? 'nesw-resize'
      : a < 112.5
        ? 'ew-resize'
        : 'nwse-resize';
}

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
  targets = [],
  onGuides,
  onStart,
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
  // Other layers' boxes to snap to (the canvas is added), and where to show
  // the red guides while dragging.
  targets?: Box[];
  onGuides?: (g: Guide[]) => void;
  // A drag (move, resize or turn) is starting, so the owner can keep what it
  // started from.
  onStart?: () => void;
}) {
  const snapTo = [...targets, canvasBox(size)];
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
    onStart?.();
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
    const tol = SNAP_PX * d.unit;
    // ⌘ held: no snapping, as in Figma.
    const free = e.metaKey;
    if (d.grip === 'move') {
      const moved = { ...s, x: s.x + dx, y: s.y + dy };
      const sn = free
        ? { dx: 0, dy: 0, guides: [] }
        : snapMove(boundsOf([moved])!, snapTo, tol);
      onGuides?.(sn.guides);
      onChange({
        ...s,
        x: Math.round(moved.x + sn.dx),
        y: Math.round(moved.y + sn.dy),
      });
      return;
    }
    const snap = (v: number, axis: 'x' | 'y') =>
      free ? v : snapEdge(v, snapTo, axis, tol);
    let { x: x0, y: y0 } = s;
    let x1 = s.x + s.w;
    let y1 = s.y + s.h;
    // Which sides move: a corner moves two, a side one.
    const gx = d.grip.includes('w') ? 'w' : d.grip.includes('e') ? 'e' : null;
    const gy = d.grip.includes('n') ? 'n' : d.grip.includes('s') ? 's' : null;
    if (gx === 'w') x0 = snap(x0 + dx, 'x');
    else if (gx === 'e') x1 = snap(x1 + dx, 'x');
    if (gy === 'n') y0 = snap(y0 + dy, 'y');
    else if (gy === 's') y1 = snap(y1 + dy, 'y');
    // Shift keeps the proportions. From a corner the larger stretch wins and
    // the opposite corner stays put; from a side the other dimension follows,
    // about its centre.
    if (e.shiftKey) {
      const k = Math.max(
        gx ? (x1 - x0) / s.w : 0,
        gy ? (y1 - y0) / s.h : 0,
        1 / Math.min(s.w, s.h),
      );
      const w = s.w * k;
      const h = s.h * k;
      if (gx === 'w') x0 = x1 - w;
      else if (gx === 'e') x1 = x0 + w;
      else {
        x0 = s.x + (s.w - w) / 2;
        x1 = x0 + w;
      }
      if (gy === 'n') y0 = y1 - h;
      else if (gy === 's') y1 = y0 + h;
      else {
        y0 = s.y + (s.h - h) / 2;
        y1 = y0 + h;
      }
    }
    // Edges are rounded, not position and size apiece, so a side that isn't
    // being dragged stays exactly where it was.
    const [l, r, t, b] = [x0, x1, y0, y1].map(Math.round);
    const next = {
      ...s,
      x: Math.min(l, r - 1),
      y: Math.min(t, b - 1),
      w: Math.max(1, r - l),
      h: Math.max(1, b - t),
    };
    onGuides?.(free || s.rot ? [] : guidesFor(next, snapTo));
    onChange(next);
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
        onGuides?.([]);
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
      {/* The sides: thin grab strips along each edge, under the corners. */}
      {(['n', 's', 'e', 'w'] as const).map((g) => (
        <span
          key={g}
          onPointerDown={(e) => down(e, g)}
          className="pointer-events-auto absolute"
          style={{
            ...(g === 'n' || g === 's'
              ? {
                  left: 0,
                  width: '100%',
                  height: 8,
                  top: g === 'n' ? 0 : '100%',
                }
              : {
                  top: 0,
                  height: '100%',
                  width: 8,
                  left: g === 'w' ? 0 : '100%',
                }),
            transform:
              g === 'n' || g === 's' ? 'translateY(-50%)' : 'translateX(-50%)',
            cursor: edgeCursor(g === 'n' || g === 's' ? 0 : 90, frame.rot),
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
