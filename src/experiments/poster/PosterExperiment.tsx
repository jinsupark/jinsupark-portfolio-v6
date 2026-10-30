import { Canvas } from '@react-three/fiber';
import { useRef, useState } from 'react';
import * as THREE from 'three';
import ControlPanel from '@/lab/ControlPanel';
import ExperimentChrome from '@/lab/ExperimentChrome';
import PosterScene from './PosterScene';
import { posterControls } from './posterControls';
import { PosterInput } from './posterRenderer';

export default function PosterExperiment() {
  const [input] = useState(() => new PosterInput());
  const host = useRef<HTMLDivElement>(null);

  const toWall = (e: React.PointerEvent) => {
    const r = host.current!.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = 1 - (e.clientY - r.top) / r.height;
    return new THREE.Vector2((x - 0.5) * (r.width / r.height), y - 0.5);
  };

  return (
    <div
      ref={host}
      className="fixed inset-0 cursor-crosshair touch-none bg-black select-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        input.push({ type: 'down', at: toWall(e) });
      }}
      onPointerMove={(e) => {
        if (e.buttons & 1) input.push({ type: 'move', at: toWall(e) });
      }}
      onPointerUp={() => input.push({ type: 'up' })}
      onPointerCancel={() => input.push({ type: 'up' })}
    >
      <Canvas flat dpr={[1, 2]} gl={{ antialias: false }}>
        <PosterScene input={input} />
      </Canvas>
      <ExperimentChrome title="Poster" hint="Drag to rip · ~ for controls" />
      <ControlPanel
        store={posterControls}
        actions={[
          { label: 'Clear tears', onClick: () => input.requestClear() },
          {
            label: 'Re-deal',
            onClick: () =>
              posterControls.set('seed', 1 + Math.floor(Math.random() * 999)),
          },
        ]}
      />
    </div>
  );
}
