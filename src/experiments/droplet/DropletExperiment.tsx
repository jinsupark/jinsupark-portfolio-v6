import { useEffect, useRef } from 'react';
import ControlPanel from '@/lab/ControlPanel';
import ExperimentChrome from '@/lab/ExperimentChrome';
import { dropletControls } from './dropletControls';
import { DropletRenderer } from './dropletRenderer';

export default function DropletExperiment() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const water = useRef<DropletRenderer | null>(null);

  useEffect(() => {
    const el = canvas.current!;
    const r = new DropletRenderer(el);
    water.current = r;
    let last = performance.now();
    let raf = 0;
    let edge = dropletControls.values.edge;

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const v = dropletControls.values;
      if (v.edge !== edge) {
        edge = v.edge;
        r.invalidate();
      }
      r.frame(
        window.innerWidth,
        window.innerHeight,
        Math.min(window.devicePixelRatio, 2),
        (t - last) / 1000,
        v,
      );
      last = t;
    };
    raf = requestAnimationFrame(frame);

    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') r.undo();
    };
    window.addEventListener('keydown', key);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', key);
      r.dispose();
      water.current = null;
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black select-none">
      <canvas
        ref={canvas}
        className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          water.current?.begin(e.clientX, e.clientY, dropletControls.values);
        }}
        onPointerMove={(e) => {
          if (e.buttons) water.current?.extend(e.clientX, e.clientY);
        }}
        onPointerUp={() => water.current?.end(dropletControls.values)}
        onPointerCancel={() => water.current?.end(dropletControls.values)}
      />
      <ExperimentChrome
        title="Water drops"
        hint="draw a shape · click for a drop · ⌘Z undo · ~ for controls"
      />
      <ControlPanel
        store={dropletControls}
        actions={[
          { label: 'Undo', onClick: () => water.current?.undo() },
          { label: 'Clear', onClick: () => water.current?.clear() },
          {
            label: 'Re-seed',
            onClick: () =>
              dropletControls.set('seed', 1 + Math.floor(Math.random() * 999)),
          },
        ]}
      />
    </div>
  );
}
