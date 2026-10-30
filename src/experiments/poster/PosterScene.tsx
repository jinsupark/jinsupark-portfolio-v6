import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { posterControls } from './posterControls';
import { PosterRenderer, type PosterInput } from './posterRenderer';

export default function PosterScene({ input }: { input: PosterInput }) {
  const gl = useThree((s) => s.gl);
  const [renderer] = useState(() => new PosterRenderer());
  useEffect(() => () => renderer.dispose(), [renderer]);

  useFrame(() => renderer.frame(gl, posterControls.values, input));

  return (
    <mesh material={renderer.wall} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}
