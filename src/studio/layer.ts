import * as THREE from 'three';
import type { Schema, Values } from '@/lab/controls';

// What the compositor needs from a layer: a texture holding this frame's
// pixels at the requested size. Everything else — blending, masking, filters,
// placement — happens in the compositor, so a layer only has to draw itself.
export type LayerInstance = {
  texture: THREE.Texture;
  // `w`×`h` design units, drawn at `scale` pixels per unit. `dt` is seconds
  // of wall time; a layer applies its own speed and pause.
  render(frame: LayerFrame): void;
  dispose(): void;
};

export type LayerFrame = {
  w: number;
  h: number;
  scale: number;
  dt: number;
  values: Record<string, unknown>;
  renderer: THREE.WebGLRenderer;
  // For a shape style on a shaped layer: the outline, closed, in this
  // render's units (the frame plus pad, so the outline sits `pad` in).
  outline?: { x: number; y: number }[];
};

export type LayerType<S extends Schema = Schema> = {
  type: string;
  label: string;
  // Bump when a change would make saved values render differently.
  version: number;
  schema: S;
  // Values a newly added layer starts from. Experiment-backed layers take the
  // experiment's current tuning, so adding one pulls in what you last saw.
  initial(): Values<S>;
  create(): LayerInstance;
  // A shape style is built from the layer's outline (`LayerFrame.outline`)
  // and draws past it, rather than being a fill clipped to it.
  shapeStyle?: boolean;
};

export const defineLayer = <S extends Schema>(t: LayerType<S>) =>
  t as unknown as LayerType;

// Most layers are 2D canvas renderers. This hosts one on an offscreen canvas
// sized to its frame and hands the result to the compositor as a texture.
const MAX_PX = 4096;
export function canvasLayer<V>(
  draw: (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    dt: number,
    values: V,
    frame: LayerFrame,
  ) => void,
  dispose?: () => void,
): LayerInstance {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  return {
    texture,
    render(frame) {
      const { w, h, scale, dt, values } = frame;
      const s = Math.min(scale, MAX_PX / w, MAX_PX / h);
      const pw = Math.max(1, Math.round(w * s));
      const ph = Math.max(1, Math.round(h * s));
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
        // A resized canvas needs a fresh GL texture of the new size.
        texture.dispose();
      }
      ctx.setTransform(pw / w, 0, 0, ph / h, 0, 0);
      draw(ctx, w, h, dt, values as V, frame);
      texture.needsUpdate = true;
    },
    dispose() {
      texture.dispose();
      dispose?.();
    },
  };
}
