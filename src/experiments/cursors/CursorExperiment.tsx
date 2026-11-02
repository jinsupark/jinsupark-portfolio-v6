import { useEffect, useRef } from 'react';
import ControlPanel from '@/lab/ControlPanel';
import ExperimentChrome from '@/lab/ExperimentChrome';
import { cursorControls } from './cursorControls';
import { CursorRenderer } from './cursorRenderer';

export default function CursorExperiment() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext('2d')!;
    const cursors = new CursorRenderer();
    let last = performance.now();
    let raf = 0;
    const move = (e: PointerEvent) =>
      cursors.setFocus({ x: e.clientX, y: e.clientY });
    const leave = () => cursors.setFocus(null);
    window.addEventListener('pointermove', move);
    document.documentElement.addEventListener('pointerleave', leave);

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
      cursors.render(ctx, W, H, (t - last) / 1000, cursorControls.values);
      last = t;
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', leave);
      cursors.dispose();
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black select-none">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      <ExperimentChrome title="Cursor orbit" hint="~ for controls" />
      <ControlPanel
        store={cursorControls}
        actions={[
          {
            label: 'Re-seed',
            onClick: () =>
              cursorControls.set('seed', 1 + Math.floor(Math.random() * 999)),
          },
        ]}
      />
    </div>
  );
}
