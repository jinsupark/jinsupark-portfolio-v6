import { useEffect, useRef } from 'react';
import ControlPanel from '@/lab/ControlPanel';
import ExperimentChrome from '@/lab/ExperimentChrome';
import { blueprintControls } from './blueprintControls';
import { BlueprintRenderer } from './blueprintRenderer';

export default function BlueprintExperiment() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext('2d')!;
    const bp = new BlueprintRenderer();
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
      bp.render(ctx, W, H, (t - last) / 1000, blueprintControls.values);
      last = t;
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      bp.dispose();
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black select-none">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      <ExperimentChrome title="Blueprint" hint="~ for controls" />
      <ControlPanel
        store={blueprintControls}
        actions={[
          {
            label: 'Re-seed',
            onClick: () =>
              blueprintControls.set(
                'seed',
                1 + Math.floor(Math.random() * 999),
              ),
          },
        ]}
      />
    </div>
  );
}
