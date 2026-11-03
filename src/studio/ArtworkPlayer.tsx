import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Compositor } from './compositor';
import { DESIGN, type Artwork } from './document';
import { layerTypesFor } from './registry';

// A live artwork, fitted inside its container at the artwork's aspect. One
// WebGL context per player, so a page of many artworks should show thumbnails
// and keep players for the one being looked at. `children` are laid over the
// artwork's exact box — the studio puts its frame handles there.
export default function ArtworkPlayer({
  doc,
  className = '',
  onCompositor,
  onBackdrop,
  children,
}: {
  doc: Artwork;
  className?: string;
  onCompositor?: (c: Compositor | null) => void;
  onBackdrop?: () => void;
  children?: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const comp = useRef<Compositor | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onComp = useRef(onCompositor);
  useEffect(() => {
    onComp.current = onCompositor;
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
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(t - last, 100) / 1000;
      last = t;
      if (onScreen) c.render(dt);
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
      const s = Math.min(r.width / DESIGN.w, r.height / DESIGN.h);
      const w = Math.floor(DESIGN.w * s);
      const h = Math.floor(DESIGN.h * s);
      setBox({ w, h });
      comp.current?.setSize(w, h, Math.min(window.devicePixelRatio, 2));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    // The artwork box is out of flow, so its size can never feed back into the
    // container it was measured from.
    <div
      ref={host}
      className={`relative overflow-hidden ${className}`}
      onPointerDown={(e) => e.target === e.currentTarget && onBackdrop?.()}
    >
      <div
        className="absolute top-1/2 left-1/2 -translate-1/2"
        style={{ width: box.w, height: box.h }}
      >
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
        {children}
      </div>
    </div>
  );
}
