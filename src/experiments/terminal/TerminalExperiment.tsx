import { useEffect, useRef } from 'react';
import ControlPanel from '@/lab/ControlPanel';
import ExperimentChrome from '@/lab/ExperimentChrome';
import { terminalControls } from './terminalControls';
import { TerminalWall } from './terminalWall';

// The content is tested inside the moving grid rather than in fixed boxes,
// because surviving a resize mid-animation is the whole requirement.
export default function TerminalExperiment() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext('2d')!;
    const wall = new TerminalWall();
    let last = performance.now();
    let raf = 0;

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const v = terminalControls.values;
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
      const dt = (Math.min(t - last, 100) / 1000) * v.speed;
      last = t;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      wall.render(ctx, W, H, dt, v);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="fixed inset-0 bg-black select-none">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      <ExperimentChrome title="Terminal content" hint="~ for controls" />
      <ControlPanel
        store={terminalControls}
        actions={[
          {
            label: 'Re-seed',
            onClick: () =>
              terminalControls.set('seed', 1 + Math.floor(Math.random() * 999)),
          },
        ]}
      />
    </div>
  );
}
