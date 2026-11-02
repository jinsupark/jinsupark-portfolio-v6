import { useEffect, useRef } from 'react';
import ControlPanel from '@/lab/ControlPanel';
import ExperimentChrome from '@/lab/ExperimentChrome';
import { collageControls } from './collageControls';
import { CollageRenderer } from './collageRenderer';

export default function CollageExperiment() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const collage = useRef<CollageRenderer | null>(null);

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext('2d')!;
    const c = new CollageRenderer();
    collage.current = c;
    let last = performance.now();
    let raf = 0;

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dpr = Math.min(window.devicePixelRatio, 2);
      const W = window.innerWidth;
      const H = window.innerHeight;
      if (
        el.width !== Math.round(W * dpr) ||
        el.height !== Math.round(H * dpr)
      ) {
        el.width = Math.round(W * dpr);
        el.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.render(ctx, W, H, (t - last) / 1000, collageControls.values);
      last = t;
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="fixed inset-0 bg-black select-none">
      <canvas
        ref={canvas}
        onPointerDown={(e) =>
          collage.current?.ripAt({ x: e.clientX, y: e.clientY })
        }
        className="absolute inset-0 h-full w-full cursor-pointer"
      />
      <ExperimentChrome title="Collage" hint="click to rip · ~ for controls" />
      <ControlPanel
        store={collageControls}
        actions={[
          {
            label: 'Re-seed',
            onClick: () =>
              collageControls.set('seed', 1 + Math.floor(Math.random() * 999)),
          },
        ]}
      />
    </div>
  );
}
