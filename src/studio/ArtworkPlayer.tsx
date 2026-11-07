import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Compositor } from './compositor';
import { sizeOf, type Artwork } from './document';
import { layerTypesFor } from './registry';
import { typing } from './tools';

// A field you type text into (as opposed to a slider, checkbox or dropdown).
// Number boxes count as not: Space means nothing in them.
const textEntry = (t: EventTarget | null) =>
  t instanceof HTMLTextAreaElement ||
  (t instanceof HTMLInputElement &&
    !['range', 'checkbox', 'radio', 'color', 'button'].includes(t.type) &&
    !['decimal', 'numeric'].includes(t.inputMode));

// Animation runs at up to this rate.
const FPS = 60;
// After a change while paused, a few more frames, so images and video that
// load in a moment still appear.
const SETTLE = 20;

const PAN_SPEED = 2;
// How long a pan or zoom rests before the artwork is redrawn sharp.
const SETTLE_MS = 120;

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 32;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

// A live artwork, fitted inside its container at the artwork's aspect. One
// WebGL context per player, so a page of many artworks should show thumbnails
// and keep players for the one being looked at. `children` are laid over the
// artwork's exact box — the studio puts its frame handles there.
//
// `navigable` adds panning and zooming, as in a design tool: pinch or
// ⌘-scroll zooms at the pointer, scrolling or space-drag pans, ⌘+ / ⌘− zoom,
// ⌘0 is 100%, ⇧1 fits. The canvas then always covers the container and the
// compositor renders just the part of the artwork in view, so the cost stays
// the same at any zoom.
export default function ArtworkPlayer({
  doc,
  className = '',
  onCompositor,
  onBackdrop,
  navigable = false,
  onZoom,
  zoomTo,
  playing = true,
  surround = '#eeeeee',
  children,
}: {
  doc: Artwork;
  className?: string;
  onCompositor?: (c: Compositor | null) => void;
  onBackdrop?: () => void;
  navigable?: boolean;
  // The zoom (1 is one design unit per CSS pixel), as it changes.
  onZoom?: (zoom: number) => void;
  // Bumped to ask for a fit (the zoom readout's click).
  zoomTo?: number;
  // Off: the artwork holds still and renders only when something changes.
  playing?: boolean;
  surround?: string;
  children?: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const comp = useRef<Compositor | null>(null);
  const [hostSize, setHostSize] = useState({ w: 0, h: 0 });
  // Zoom is relative to fitting the container; pan is in CSS pixels.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  // Dragging the view (space or middle button): the closed hand.
  const [panning, setPanning] = useState(false);
  const play = useRef(playing);
  useEffect(() => {
    play.current = playing;
  });
  const onComp = useRef(onCompositor);
  useEffect(() => {
    onComp.current = onCompositor;
  });

  const size = sizeOf(doc);
  // Fitting leaves room round the artwork when navigable, as a canvas does.
  const margin = navigable ? 40 : 0;
  const fit =
    Math.max(
      0,
      Math.min(
        (hostSize.w - 2 * margin) / size.w,
        (hostSize.h - 2 * margin) / size.h,
      ),
    ) || 0;
  const scale = fit * zoom;
  const box = {
    w: size.w * scale,
    h: size.h * scale,
    x: (hostSize.w - size.w * scale) / 2 + pan.x,
    y: (hostSize.h - size.h * scale) / 2 + pan.y,
  };

  // Panning and zooming move the canvas already drawn (a CSS transform the
  // browser composites for free) and the overlays at once; the artwork is
  // drawn afresh at the new view only once the gesture has rested, as Figma
  // and Framer do. `drawn` is the view the canvas was last drawn at.
  const [drawn, setDrawn] = useState<{
    s: number;
    x: number;
    y: number;
  } | null>(null);
  useEffect(() => {
    if (!navigable || !scale) return;
    const t = setTimeout(
      () => setDrawn({ s: scale, x: box.x, y: box.y }),
      SETTLE_MS,
    );
    return () => clearTimeout(t);
  }, [navigable, scale, box.x, box.y]);
  const at = drawn ?? { s: scale, x: box.x, y: box.y };
  const k = scale / (at.s || 1);
  // Mid-gesture nothing is drawn: the frozen frame is moved instead, leaving
  // the main thread to the input.
  const moving = k !== 1 || box.x !== at.x || box.y !== at.y;
  const movingRef = useRef(moving);
  // A press on the canvas (dragging a layer, a handle or a box) holds the
  // artwork still until it's released.
  const holding = useRef(false);
  useEffect(() => {
    const up = () => (holding.current = false);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    return () => {
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
    };
  }, []);
  useEffect(() => {
    movingRef.current = moving;
  });

  useEffect(() => {
    const c = new Compositor(canvas.current!);
    comp.current = c;
    onComp.current?.(c);
    let last = performance.now();
    let raf = 0;
    let onScreen = true;
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
    });
    io.observe(canvas.current!);
    let settle = SETTLE;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (!onScreen || movingRef.current) {
        last = t;
        return;
      }
      // Mid-drag: draw only when the document changed, with the rest held.
      c.hold = holding.current;
      if (holding.current) {
        last = t;
        if (!c.dirty) return;
        c.dirty = false;
        c.render(0);
        return;
      }
      if (play.current) {
        if (t - last < 1000 / FPS - 1) return;
        c.render(Math.min(t - last, 100) / 1000);
        last = t;
        return;
      }
      last = t;
      if (c.dirty) settle = SETTLE;
      if (settle <= 0) return;
      settle--;
      c.dirty = false;
      c.render(0);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      onComp.current?.(null);
      comp.current = null;
      c.dispose();
    };
  }, []);

  useEffect(() => {
    comp.current?.setDocument(doc, layerTypesFor(doc.slug));
  }, [doc]);

  useEffect(() => {
    const el = host.current!;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setHostSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The canvas: the whole container when navigable (sized only when the
  // container is), else the artwork's fitted box.
  const cw = navigable ? hostSize.w : Math.floor(box.w);
  const ch = navigable ? hostSize.h : Math.floor(box.h);
  useEffect(() => {
    if (cw > 0 && ch > 0)
      comp.current?.setSize(cw, ch, Math.min(window.devicePixelRatio, 2));
  }, [cw, ch]);
  useEffect(() => {
    if (!navigable || !scale) return comp.current?.setView(null);
    comp.current?.setView(
      {
        x: -at.x / at.s,
        y: -at.y / at.s,
        w: hostSize.w / at.s,
        h: hostSize.h / at.s,
        rot: 0,
      },
      surround,
    );
  });

  // Zoom to `z`, keeping the artwork point under container point (px, py).
  const zoomAt = (z: number, px: number, py: number) => {
    const next = clampZoom(z);
    const k = next / zoom;
    const cx = hostSize.w / 2;
    const cy = hostSize.h / 2;
    setPan({
      x: px - cx - (px - cx - pan.x) * k,
      y: py - cy - (py - cy - pan.y) * k,
    });
    setZoom(next);
  };
  const fitView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  const report = useRef(onZoom);
  useEffect(() => {
    report.current = onZoom;
  });
  useEffect(() => {
    if (scale) report.current?.(scale);
  }, [scale]);
  const [fitAsked, setFitAsked] = useState(zoomTo);
  if (zoomTo !== fitAsked) {
    setFitAsked(zoomTo);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  // Wheel: pinch (ctrlKey) or ⌘ zooms at the pointer, otherwise pans. Bound
  // by hand so it can be non-passive and stop the page scrolling.
  const wheel = useRef<(e: WheelEvent) => void>(() => {});
  useEffect(() => {
    wheel.current = (e: WheelEvent) => {
      e.preventDefault();
      const r = host.current!.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey)
        zoomAt(
          zoom * Math.exp(-e.deltaY * 0.01),
          e.clientX - r.left,
          e.clientY - r.top,
        );
      else {
        // Faster than 1:1, so a swipe crosses a good part of the canvas;
        // wheels that count in lines or pages are scaled to pixels first.
        const k =
          PAN_SPEED * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
        setPan((p) => ({ x: p.x - e.deltaX * k, y: p.y - e.deltaY * k }));
      }
    };
  });
  useEffect(() => {
    if (!navigable) return;
    const el = host.current!;
    const on = (e: WheelEvent) => wheel.current(e);
    el.addEventListener('wheel', on, { passive: false });
    return () => el.removeEventListener('wheel', on);
  }, [navigable]);

  // Keys: space to pan by dragging, ⌘+ / ⌘− / ⌘0 / ⇧1 to zoom.
  useEffect(() => {
    if (!navigable) return;
    const down = (e: KeyboardEvent) => {
      // Space pans unless a text field has it; a focused dropdown, slider or
      // button shouldn't swallow it.
      if (e.code === 'Space' && !textEntry(e.target)) {
        e.preventDefault();
        setSpaceHeld(true);
        return;
      }
      if (typing(e)) return;
      const cmd = e.metaKey || e.ctrlKey;
      const mid = [hostSize.w / 2, hostSize.h / 2] as const;
      if (cmd && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomAt(zoom * 2, ...mid);
      } else if (cmd && e.key === '-') {
        e.preventDefault();
        zoomAt(zoom / 2, ...mid);
      } else if (cmd && e.key === '0') {
        e.preventDefault();
        if (fit) zoomAt(1 / fit, ...mid);
      } else if (e.shiftKey && e.code === 'Digit1') {
        e.preventDefault();
        fitView();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || textEntry(e.target)) return;
      // A focused button would otherwise click on Space's release.
      e.preventDefault();
      setSpaceHeld(false);
    };
    // Capture phase, so nothing else can swallow Space first.
    addEventListener('keydown', down, true);
    addEventListener('keyup', up, true);
    return () => {
      removeEventListener('keydown', down, true);
      removeEventListener('keyup', up, true);
    };
  });

  // Space-drag or middle-drag pans, ahead of the tools in the artwork box.
  const panDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!navigable || !(spaceHeld || e.button === 1)) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    const x0 = e.clientX - pan.x;
    const y0 = e.clientY - pan.y;
    el.setPointerCapture(e.pointerId);
    setPanning(true);
    const move = (m: PointerEvent) =>
      setPan({ x: m.clientX - x0, y: m.clientY - y0 });
    const end = () => {
      setPanning(false);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', end);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
  };

  return (
    // The artwork box is out of flow, so its size can never feed back into the
    // container it was measured from.
    <div
      ref={host}
      className={`relative overflow-hidden ${className}`}
      data-hand={panning ? 'grabbing' : spaceHeld ? 'grab' : undefined}
      onPointerDownCapture={(e) => {
        // Working on the canvas takes the keyboard back from the panel, so
        // tool keys and Space reach it.
        const a = document.activeElement;
        if (a instanceof HTMLElement && a !== document.body) a.blur();
        if (navigable && e.button === 0 && !spaceHeld) holding.current = true;
        panDrag(e);
      }}
      onPointerDown={(e) => e.target === e.currentTarget && onBackdrop?.()}
    >
      <canvas
        ref={canvas}
        className="pointer-events-none absolute"
        style={
          navigable
            ? {
                left: 0,
                top: 0,
                width: cw,
                height: ch,
                transformOrigin: '0 0',
                transform:
                  k === 1 && box.x === at.x && box.y === at.y
                    ? undefined
                    : `translate(${box.x - at.x * k}px, ${box.y - at.y * k}px) scale(${k})`,
              }
            : { left: box.x, top: box.y, width: cw, height: ch }
        }
      />
      <div
        className="absolute"
        style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      >
        {children}
      </div>
    </div>
  );
}
