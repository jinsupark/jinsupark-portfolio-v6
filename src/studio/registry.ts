import type { LayerType } from './layer';
import {
  gradientLayer,
  imageLayer,
  solidLayer,
  videoLayer,
} from './layers/basicLayers';
import {
  blueprintLayer,
  collageLayer,
  cursorLayer,
  mapLayer,
  gridLayer,
  pathLayer,
  scatterLayer,
  terminalLayer,
} from './layers/experimentLayers';

export const BUILTIN_LAYERS: LayerType[] = [
  gridLayer,
  blueprintLayer,
  terminalLayer,
  pathLayer,
  scatterLayer,
  cursorLayer,
  collageLayer,
  mapLayer,
  solidLayer,
  gradientLayer,
  imageLayer,
  videoLayer,
];

// An artwork's own layer variants: `src/works/<slug>/layers/<name>.ts`, each
// default-exporting a layer type, addressed from that artwork as
// `local/<name>`. They're packaged with the artwork so a custom tweak never
// changes a built-in layer — or any other artwork using it.
const LOCAL = import.meta.glob<LayerType>('../works/*/layers/*.ts', {
  eager: true,
  import: 'default',
});

export function layerTypesFor(slug: string): Record<string, LayerType> {
  const out: Record<string, LayerType> = {};
  for (const t of BUILTIN_LAYERS) out[t.type] = t;
  const prefix = `../works/${slug}/layers/`;
  for (const [file, t] of Object.entries(LOCAL)) {
    if (!file.startsWith(prefix)) continue;
    const name = file.slice(prefix.length, -'.ts'.length);
    out[`local/${name}`] = { ...t, type: `local/${name}` };
  }
  return out;
}
