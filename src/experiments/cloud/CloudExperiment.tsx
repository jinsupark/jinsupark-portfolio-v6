import { useEffect, useRef } from 'react';
import ControlPanel from '@/lab/ControlPanel';
import ExperimentChrome from '@/lab/ExperimentChrome';
import { cloudControls } from './cloudControls';
import { CloudRenderer } from './cloudRenderer';

export default function CloudExperiment() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cloud = new CloudRenderer(canvas.current!);
    let last = performance.now();
    let raf = 0;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      cloud.frame(
        window.innerWidth,
        window.innerHeight,
        Math.min(window.devicePixelRatio, 2),
        (t - last) / 1000,
        cloudControls.values,
      );
      last = t;
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      cloud.dispose();
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black select-none">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      <ExperimentChrome title="Cloud timelapse" hint="~ for controls" />
      <ControlPanel
        store={cloudControls}
        actions={[
          {
            label: 'Re-seed',
            onClick: () =>
              cloudControls.set('seed', 1 + Math.floor(Math.random() * 999)),
          },
        ]}
      />
    </div>
  );
}
