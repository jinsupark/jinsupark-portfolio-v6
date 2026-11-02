import { useEffect, useRef } from 'react';
import ControlPanel from '@/lab/ControlPanel';
import ExperimentChrome from '@/lab/ExperimentChrome';
import { mapControls } from './mapControls';
import { MapRenderer } from './mapRenderer';

export default function MapExperiment() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext('2d')!;
    const map = new MapRenderer();
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
      map.render(ctx, W, H, (t - last) / 1000, mapControls.values);
      last = t;
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="fixed inset-0 bg-black select-none">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      <ExperimentChrome title="City map" hint="~ for controls" />
      <ControlPanel
        store={mapControls}
        actions={[
          {
            label: 'Re-seed',
            onClick: () =>
              mapControls.set('seed', 1 + Math.floor(Math.random() * 999)),
          },
        ]}
      />
    </div>
  );
}
