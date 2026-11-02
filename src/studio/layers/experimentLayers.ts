import { BlueprintRenderer } from '@/experiments/blueprint/blueprintRenderer';
import {
  blueprintControls,
  type BlueprintValues,
} from '@/experiments/blueprint/blueprintControls';
import { gridControls, type GridValues } from '@/experiments/grid/gridControls';
import { GridRenderer } from '@/experiments/grid/gridRenderer';
import {
  terminalControls,
  type TermValues,
} from '@/experiments/terminal/terminalControls';
import { TerminalWall } from '@/experiments/terminal/terminalWall';
import {
  pathControls,
  type PathValues,
} from '@/experiments/paths/pathControls';
import { PathRenderer } from '@/experiments/paths/pathRenderer';
import {
  cursorControls,
  type CursorValues,
} from '@/experiments/cursors/cursorControls';
import { CursorRenderer } from '@/experiments/cursors/cursorRenderer';
import {
  scatterControls,
  type ScatterValues,
} from '@/experiments/scatter/scatterControls';
import { ScatterRenderer } from '@/experiments/scatter/scatterRenderer';
import {
  collageControls,
  type CollageValues,
} from '@/experiments/collage/collageControls';
import { CollageRenderer } from '@/experiments/collage/collageRenderer';
import { mapControls, type MapValues } from '@/experiments/map/mapControls';
import { MapRenderer } from '@/experiments/map/mapRenderer';
import { canvasLayer, defineLayer } from '../layer';

// Layers backed by an experiment's renderer. They run the experiment's own
// code against values held by the layer, never against the experiment's live
// store, so retuning the experiment page doesn't reach into saved artworks.

export const gridLayer = defineLayer({
  type: 'grid',
  label: 'Window grid',
  version: 1,
  schema: gridControls.schema,
  initial: () => ({ ...gridControls.values }),
  create() {
    // The terminal windows use the terminal experiment's saved defaults; a
    // layer has no terminal controls of its own.
    const terminal = { ...terminalControls.defaults() };
    const r = new GridRenderer(() => terminal);
    return canvasLayer<GridValues>((ctx, w, h, dt, v) =>
      r.render(ctx, w, h, dt, v),
    );
  },
});

export const blueprintLayer = defineLayer({
  type: 'blueprint',
  label: 'Blueprint',
  version: 1,
  schema: blueprintControls.schema,
  initial: () => ({ ...blueprintControls.values }),
  create() {
    const r = new BlueprintRenderer();
    return canvasLayer<BlueprintValues>(
      (ctx, w, h, dt, v) => r.render(ctx, w, h, dt, v),
      () => r.dispose(),
    );
  },
});

export const pathLayer = defineLayer({
  type: 'paths',
  label: 'Node path',
  version: 1,
  schema: pathControls.schema,
  initial: () => ({ ...pathControls.values }),
  shapeStyle: true,
  create() {
    const r = new PathRenderer();
    return canvasLayer<PathValues>((ctx, w, h, dt, v, f) =>
      r.render(ctx, w, h, dt, v, f.outline),
    );
  },
});

export const scatterLayer = defineLayer({
  type: 'scatter',
  label: 'Scattered windows',
  version: 1,
  schema: scatterControls.schema,
  initial: () => ({ ...scatterControls.values }),
  create() {
    const r = new ScatterRenderer();
    return canvasLayer<ScatterValues>(
      (ctx, w, h, dt, v) => r.render(ctx, w, h, dt, v),
      () => r.dispose(),
    );
  },
});

// No pointer inside an artwork, so the orbits keep to the frame's centre.
export const cursorLayer = defineLayer({
  type: 'cursors',
  label: 'Cursor orbit',
  version: 1,
  schema: cursorControls.schema,
  initial: () => ({ ...cursorControls.values }),
  create() {
    const r = new CursorRenderer();
    return canvasLayer<CursorValues>(
      (ctx, w, h, dt, v) => r.render(ctx, w, h, dt, v),
      () => r.dispose(),
    );
  },
});

export const mapLayer = defineLayer({
  type: 'map',
  label: 'City map',
  version: 1,
  schema: mapControls.schema,
  initial: () => ({ ...mapControls.values }),
  create() {
    const r = new MapRenderer();
    return canvasLayer<MapValues>((ctx, w, h, dt, v) =>
      r.render(ctx, w, h, dt, v),
    );
  },
});

export const collageLayer = defineLayer({
  type: 'collage',
  label: 'Collage',
  version: 1,
  schema: collageControls.schema,
  initial: () => ({ ...collageControls.values }),
  create() {
    const r = new CollageRenderer();
    return canvasLayer<CollageValues>((ctx, w, h, dt, v) =>
      r.render(ctx, w, h, dt, v),
    );
  },
});

export const terminalLayer = defineLayer({
  type: 'terminal',
  label: 'Terminal wall',
  version: 1,
  schema: terminalControls.schema,
  initial: () => ({ ...terminalControls.values }),
  create() {
    const wall = new TerminalWall();
    return canvasLayer<TermValues>((ctx, w, h, dt, v) =>
      wall.render(ctx, w, h, Math.min(dt, 0.1) * v.speed, v),
    );
  },
});
