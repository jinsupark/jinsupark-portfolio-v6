import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import ControlPanel from '@/lab/ControlPanel';
import ExperimentChrome from '@/lab/ExperimentChrome';
import { glassControls } from './glassControls';
import { GlassRenderer } from './glassRenderer';

function GlassScene() {
  const [renderer] = useState(() => new GlassRenderer());
  const { gl, size } = useThree();

  useEffect(() => () => renderer.dispose(), [renderer]);
  useEffect(
    () => renderer.resize(gl, size.width, size.height),
    [renderer, gl, size.width, size.height],
  );

  // Priority 1 takes over rendering from r3f, so the composer's passes run
  // instead of a plain scene render.
  useFrame((state, delta) => {
    renderer.frame(
      state.gl,
      state.scene,
      state.camera as THREE.PerspectiveCamera,
      delta,
      glassControls.values,
    );
  }, 1);

  return <primitive object={renderer.mesh} />;
}

export default function GlassExperiment() {
  return (
    <div className="fixed inset-0 bg-black select-none">
      <Canvas flat dpr={[1, 2]} gl={{ antialias: true }}>
        <GlassScene />
      </Canvas>
      <ExperimentChrome
        title="Glass"
        hint="Content is tuned on the terminal experiment · ~ for controls"
      />
      <ControlPanel store={glassControls} />
    </div>
  );
}
