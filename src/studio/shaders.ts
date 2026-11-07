import {
  DOC_VERSION,
  fullFrame,
  newLayer,
  type Artwork,
  type Size,
} from './document';
import { renderArtwork } from './exporter';
import type { LayerType } from './layer';
import { BUILTIN_LAYERS } from './registry';

// The shaders the projects page lists and the playground opens: every
// built-in fill type that isn't a first-party paint.
export const SHADERS: LayerType[] = BUILTIN_LAYERS.filter((t) => !t.paint);
export const SHADER_TYPES: Record<string, LayerType> = Object.fromEntries(
  SHADERS.map((t) => [t.type, t]),
);

// One shader filling a canvas, as an artwork, so the playground and the
// thumbnails render it exactly as an artwork's fill would.
export function shaderArtwork(
  t: LayerType,
  values: Record<string, unknown>,
  size: Size,
): Artwork {
  return {
    version: DOC_VERSION,
    slug: `shader-${t.type}`,
    title: t.label,
    about: '',
    background: '#e3e1dc',
    size,
    layers: [
      newLayer(
        t.label,
        fullFrame(size),
        [
          {
            id: 'shader-fill',
            type: t.type,
            version: t.version,
            values,
            visible: true,
            opacity: 1,
            blend: 'normal',
          },
        ],
        'shader',
      ),
    ],
  };
}

// Thumbnails, rendered one at a time (each needs a WebGL context of its own)
// and kept for the session.
const thumbs = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();
export function shaderThumb(t: LayerType): Promise<string> {
  let p = thumbs.get(t.type);
  if (!p) {
    const doc = shaderArtwork(t, { ...t.initial() }, { w: 800, h: 1000 });
    p = queue.then(async () => {
      const blob = await renderArtwork(doc, SHADER_TYPES, {
        id: 'thumb',
        scale: 0.4,
        format: 'jpg',
      });
      return URL.createObjectURL(blob);
    });
    queue = p.catch(() => {});
    thumbs.set(t.type, p);
  }
  return p;
}
