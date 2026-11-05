import * as THREE from 'three';
import { defaultsOf, fit } from '@/lab/controls';
import {
  BLUR_FRAG,
  DIST_FRAG,
  FILL_FRAG,
  LAYER_FRAG,
  POST_FRAG,
  SDF_FRAG,
  STACK_FRAG,
  VERT,
} from './compositorShaders';
import {
  BLEND_MODES,
  DESIGN,
  fillsOf,
  filtersOf,
  shadowsOf,
  strokesOf,
  type Artwork,
  type FillDoc,
  type Frame,
  type LayerDoc,
} from './document';
import type { LayerInstance, LayerType } from './layer';
import { flatten, verticesOf, type ShapeDoc } from './shape';
import { combineSchema, edgeSchema, FILTERS } from './studioSchemas';

type Edge = typeof EDGE_DEFAULTS;
type Pair = [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
const EDGE_DEFAULTS = defaultsOf(edgeSchema);
const OPS = ['none', 'union', 'intersect', 'subtract', 'exclude'];
const MAX_PTS = 4096;
const MAX_SHADOWS = 8;
const SDF_MAX_PX = 560;
const STYLE_PAD = 90;
// Steps of the stack pass (see STACK_FRAG).
const OP = {
  fill: 0,
  pixelate: 1,
  mono: 2,
  invert: 3,
  posterize: 4,
  threshold: 5,
  dither: 6,
  texture: 7,
  cut: 8,
  stroke: 9,
} as const;
const ALIGN = ['inside', 'center', 'outside'];
const blendOf = (b: string) =>
  Math.max(0, BLEND_MODES.indexOf(b as (typeof BLEND_MODES)[number]));

// How far past the frame a layer can draw: the field has to reach as far as
// the furthest stroke or shadow does.
export function padOf(l: LayerDoc, e: Edge) {
  let reach = 0;
  for (const s of strokesOf(l)) {
    if (!s.visible) continue;
    const w = s.width * (1 + s.fibers);
    const out = s.align === 'outside' ? w : s.align === 'center' ? w / 2 : 0;
    reach = Math.max(reach, out + Math.max(0, s.offset));
  }
  for (const s of shadowsOf(l))
    if (s.visible)
      reach = Math.max(reach, Math.abs(s.x) + Math.abs(s.y) + s.blur);
  return 24 + e.tear * 1.5 + e.feather + reach;
}

type Sdf = {
  rt: THREE.WebGLRenderTarget;
  shape: ShapeDoc;
  w: number;
  h: number;
  pad: number;
};

const rgb = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16) || 0;
  return new THREE.Vector3(
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255,
  );
};

const pass = (frag: string, uniforms: Record<string, THREE.IUniform>) =>
  new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: frag,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });

const target = (w = 1, h = 1, half = false) =>
  new THREE.WebGLRenderTarget(w, h, {
    depthBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    ...(half && { type: THREE.HalfFloatType, format: THREE.RGBAFormat }),
  });

// The whole artwork in one WebGL context and one canvas. Each layer is built
// in artwork-sized buffers: its outline as a distance, its fills stacked, its
// filters run, the result cut to the outline, its strokes laid on. Then it's
// laid onto the artwork with its shadows, bottom to top, ping-ponging between
// two render targets, and the post pass runs onto the canvas.
export class Compositor {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private fill = pass(FILL_FRAG, { uColor: { value: new THREE.Vector3() } });
  private distPass = pass(DIST_FRAG, {
    uDesign: { value: new THREE.Vector2(DESIGN.w, DESIGN.h) },
    uFrame: { value: new THREE.Vector4() },
    uRot: { value: 0 },
    uShape: { value: null },
    uShapeMode: { value: 0 },
    uPad: { value: 0 },
    uOp0: { value: null },
    uOp1: { value: null },
    uOp2: { value: null },
    uOpKind: { value: new THREE.Vector3() },
    uOpMode: { value: new THREE.Vector3() },
    uOpFrame0: { value: new THREE.Vector4() },
    uOpFrame1: { value: new THREE.Vector4() },
    uOpFrame2: { value: new THREE.Vector4() },
    uOpRot: { value: new THREE.Vector3() },
    uOpPad: { value: new THREE.Vector3() },
    uSmooth: { value: 0 },
    uTear: { value: 0 },
    uTearScale: { value: 0.06 },
    uSeed: { value: 1 },
  });
  private stackPass = pass(STACK_FRAG, {
    uPrev: { value: null },
    uBase: { value: null },
    uSrc: { value: null },
    uDist: { value: null },
    uDesign: { value: new THREE.Vector2(DESIGN.w, DESIGN.h) },
    uFrame: { value: new THREE.Vector4() },
    uRot: { value: 0 },
    uPad: { value: 0 },
    uSrcSpace: { value: 0 },
    uOp: { value: 0 },
    uInput: { value: 0 },
    uGrid: { value: new THREE.Vector4() },
    uGridRot: { value: 0 },
    uCells: { value: new THREE.Vector2() },
    uAmount: { value: 1 },
    uInk: { value: new THREE.Vector3() },
    uPaper: { value: new THREE.Vector3() },
    uFeather: { value: 0 },
    uWidth: { value: 0 },
    uAlign: { value: 1 },
    uOffset: { value: 0 },
    uFibers: { value: 0 },
    uTearScale: { value: 0.06 },
    uSeed: { value: 1 },
    uOpacity: { value: 1 },
    uBlend: { value: 0 },
  });
  private blurPass = pass(BLUR_FRAG, {
    uSrc: { value: null },
    uStep: { value: new THREE.Vector2() },
    uRadius: { value: 0 },
    uOpaque: { value: false },
  });
  private layerPass = pass(LAYER_FRAG, {
    uBase: { value: null },
    uLayer: { value: null },
    uDist: { value: null },
    uMask: { value: null },
    uDesign: { value: new THREE.Vector2(DESIGN.w, DESIGN.h) },
    uShadows: { value: 0 },
    uShadowGeo: {
      value: Array.from({ length: MAX_SHADOWS }, () => new THREE.Vector4()),
    },
    uShadowColor: {
      value: Array.from({ length: MAX_SHADOWS }, () => new THREE.Vector4()),
    },
    uMaskFrame: { value: new THREE.Vector4() },
    uMaskRot: { value: 0 },
    uMaskMode: { value: 0 },
    uMaskInvert: { value: false },
    uOpacity: { value: 1 },
    uBlend: { value: 0 },
  });
  private post = pass(POST_FRAG, {
    uSrc: { value: null },
    uRes: { value: new THREE.Vector2() },
    uTime: { value: 0 },
    uGrain: { value: 0 },
    uGrainSize: { value: 1 },
    uVignette: { value: 0 },
  });
  private pts = new THREE.DataTexture(
    new Float32Array(MAX_PTS * 4),
    MAX_PTS,
    1,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  private sdfPass = pass(SDF_FRAG, {
    uPts: { value: this.pts },
    uCount: { value: 0 },
    uDomain: { value: new THREE.Vector4() },
  });

  // The artwork so far, ping-ponged layer by layer.
  private targets: Pair = [target(), target()];
  // A layer is built here: fills, filters, then cut and strokes.
  private build: Pair = [target(), target()];
  // A stroke's paint stacks here before it's laid on.
  private paint: Pair = [target(), target()];
  // A blur's two directions.
  private blurs: Pair = [target(), target()];
  // The current layer's outline as a distance at every pixel.
  private dist = target(1, 1, true);
  // Layers used as a mask keep their fills for the whole frame.
  private mattes = new Map<string, Pair>();

  private sdfs = new Map<string, Sdf>();
  // Bound to the field samplers a plain-rectangle layer never reads.
  private blank = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  private outlines = new WeakMap<
    ShapeDoc,
    { w: number; h: number; pts: { x: number; y: number }[] }
  >();
  private instances = new Map<string, { type: string; inst: LayerInstance }>();
  private doc: Artwork | null = null;
  private types: Record<string, LayerType> = {};
  private time = 0;
  private px = { w: 1, h: 1 };

  readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.autoClear = false;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.fill);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.pts.minFilter = this.pts.magFilter = THREE.NearestFilter;
    this.blank.needsUpdate = true;
  }

  // `width`×`height` CSS pixels on screen; the artwork's aspect is the
  // caller's job.
  setSize(width: number, height: number, dpr: number) {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.px = { w: Math.round(width * dpr), h: Math.round(height * dpr) };
    for (const t of this.allTargets()) t.setSize(this.px.w, this.px.h);
  }

  private allTargets() {
    return [
      ...this.targets,
      ...this.build,
      ...this.paint,
      ...this.blurs,
      this.dist,
      ...[...this.mattes.values()].flat(),
    ];
  }

  // Cheap to call every time the document changes: instances are kept by
  // fill id and only created or disposed when a fill appears, disappears or
  // changes type.
  setDocument(doc: Artwork, types: Record<string, LayerType>) {
    this.doc = doc;
    this.types = types;
    const fills = new Map(
      doc.layers
        .flatMap((l) => [
          ...fillsOf(l),
          ...strokesOf(l).flatMap((s) => s.fills),
        ])
        .map((f) => [f.id, f]),
    );
    for (const [id, e] of this.instances) {
      if (fills.get(id)?.type !== e.type) {
        e.inst.dispose();
        this.instances.delete(id);
      }
    }
    const masks = new Set(doc.layers.map((l) => l.mask.source));
    for (const [id, pair] of this.mattes) {
      if (masks.has(id)) continue;
      for (const t of pair) t.dispose();
      this.mattes.delete(id);
    }
    for (const [id, s] of this.sdfs) {
      const l = doc.layers.find((x) => x.id === id);
      if (!l?.shape) {
        s.rt.dispose();
        this.sdfs.delete(id);
      }
    }
  }

  private edges = new WeakMap<object, Edge>();
  edgeOf(l: LayerDoc): Edge {
    if (!l.edge) return EDGE_DEFAULTS;
    let e = this.edges.get(l.edge);
    if (!e) {
      e = { ...EDGE_DEFAULTS, ...fit(l.edge, edgeSchema) } as Edge;
      this.edges.set(l.edge, e);
    }
    return e;
  }

  // A layer with a shape-style fill (Node path) is drawn from its outline
  // rather than cut to it.
  private isStyled(l: LayerDoc) {
    return fillsOf(l).some((f) => f.visible && this.types[f.type]?.shapeStyle);
  }

  // A shape style draws stickers and labels past its outline, so it gets
  // room beyond what the edge effects need.
  private padFor(l: LayerDoc) {
    const pad = padOf(l, this.edgeOf(l));
    return this.isStyled(l) ? pad + STYLE_PAD : pad;
  }

  private outlineOf(s: ShapeDoc, w: number, h: number) {
    const c = this.outlines.get(s);
    if (c && c.w === w && c.h === h) return c.pts;
    const pts = flatten(verticesOf(s, w, h), w, h, 1200);
    this.outlines.set(s, { w, h, pts });
    return pts;
  }

  // The layer's distance field, rebuilt only when its outline, size or pad
  // changes. Mode 0 is a plain frame, worked out exactly in the distance pass.
  private fieldOf(l: LayerDoc): {
    tex: THREE.Texture;
    mode: number;
    pad: number;
  } {
    const pad = this.padFor(l);
    if (!l.shape) return { tex: this.blank, mode: 0, pad };
    const { w, h } = l.frame;
    let s = this.sdfs.get(l.id);
    if (s && s.shape === l.shape && s.w === w && s.h === h && s.pad === pad)
      return { tex: s.rt.texture, mode: 1, pad };
    const pts = this.outlineOf(l.shape, w, h);
    if (pts.length < 3) return { tex: this.blank, mode: 0, pad };
    const dw = w + 2 * pad;
    const dh = h + 2 * pad;
    const k = SDF_MAX_PX / Math.max(dw, dh);
    const pw = Math.max(8, Math.round(dw * k));
    const ph = Math.max(8, Math.round(dh * k));
    if (!s) {
      s = { rt: target(pw, ph, true), shape: l.shape, w, h, pad };
      this.sdfs.set(l.id, s);
    } else s.rt.setSize(pw, ph);
    Object.assign(s, { shape: l.shape, w, h, pad });
    const data = this.pts.image.data as Float32Array;
    const n = Math.min(MAX_PTS, pts.length);
    for (let i = 0; i < n; i++) {
      data[i * 4] = pts[i].x;
      data[i * 4 + 1] = pts[i].y;
    }
    this.pts.needsUpdate = true;
    this.sdfPass.uniforms.uCount.value = n;
    this.sdfPass.uniforms.uDomain.value.set(-pad, -pad, dw, dh);
    this.draw(this.sdfPass, s.rt);
    return { tex: s.rt.texture, mode: 1, pad };
  }

  // What a shape style draws round: the outline in its padded render's units.
  private styled = new Map<
    string,
    {
      key: unknown;
      w: number;
      h: number;
      pad: number;
      pts: { x: number; y: number }[];
    }
  >();
  private styleOutline(l: LayerDoc, pad: number) {
    const { w, h } = l.frame;
    const shape = l.shape;
    const c = this.styled.get(l.id);
    if (c && c.key === shape && c.w === w && c.h === h && c.pad === pad)
      return c.pts;
    const pts = (
      shape
        ? this.outlineOf(shape, w, h)
        : [
            { x: 0, y: 0 },
            { x: w, y: 0 },
            { x: w, y: h },
            { x: 0, y: h },
          ]
    ).map((p) => ({ x: p.x + pad, y: p.y + pad }));
    this.styled.set(l.id, { key: shape, w, h, pad, pts });
    return pts;
  }

  private combines = new WeakMap<object, Record<string, unknown>>();
  private combineOf(l: LayerDoc, layers: LayerDoc[]) {
    if (!l.combine) return null;
    let c = this.combines.get(l.combine);
    if (!c) {
      const s = combineSchema(l, layers);
      c = { ...defaultsOf(s), ...fit(l.combine, s) };
      this.combines.set(l.combine, c);
    }
    return c;
  }

  private instanceOf(f: FillDoc, l: LayerDoc) {
    let e = this.instances.get(f.id);
    if (!e) {
      const t = this.types[f.type];
      if (!t) return null;
      if (f.version !== undefined && t.version !== f.version)
        console.warn(
          `[studio] a fill of "${l.name}" was saved with ${f.type} v${f.version}; now v${t.version}`,
        );
      e = { type: f.type, inst: t.create() };
      this.instances.set(f.id, e);
    }
    return e.inst;
  }

  // Saved values checked against the schema, with anything missing or out of
  // range taken from the schema itself — never from an experiment's live
  // store, which would let retuning an experiment reach into saved work.
  private resolved = new WeakMap<object, Record<string, unknown>>();
  private valuesOf(
    o: { values: Record<string, unknown> },
    schema: LayerType['schema'],
  ) {
    let v = this.resolved.get(o.values);
    if (!v) {
      v = { ...defaultsOf(schema), ...fit(o.values, schema) };
      this.resolved.set(o.values, v);
    }
    return v;
  }

  // The box a filter's grid is laid across: what the layer's first fill
  // fills — its frame plus pad for a shape style, the whole artwork for a
  // canvas-space fill, else the frame.
  private gridOf(l: LayerDoc, pad: number): Frame {
    const f = l.frame;
    if (this.isStyled(l))
      return {
        ...f,
        x: f.x - pad,
        y: f.y - pad,
        w: f.w + 2 * pad,
        h: f.h + 2 * pad,
      };
    if (fillsOf(l)[0]?.fillSpace === 'canvas')
      return { x: 0, y: 0, w: DESIGN.w, h: DESIGN.h, rot: 0 };
    return f;
  }

  private draw(
    material: THREE.Material,
    target: THREE.WebGLRenderTarget | null,
  ) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  private clear(t: THREE.WebGLRenderTarget) {
    this.renderer.setRenderTarget(t);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
  }

  // One stack step from `pair[0]` into `pair[1]`, then swapped, so the result
  // is always in `pair[0]`. The layer's frame and pad are set per layer.
  private step(pair: Pair, set: (u: Record<string, THREE.IUniform>) => void) {
    const u = this.stackPass.uniforms;
    u.uPrev.value = pair[0].texture;
    u.uOpacity.value = 1;
    u.uBlend.value = 0;
    u.uInput.value = 0;
    u.uSrc.value = this.blank;
    set(u);
    this.draw(this.stackPass, pair[1]);
    pair.reverse();
  }

  // Lay `fills` over what's in `pair[0]`. Returns whether any drew.
  private stackFills(
    l: LayerDoc,
    fills: FillDoc[],
    pair: Pair,
    scale: number,
    dt: number,
  ) {
    const pad = this.padFor(l);
    const fr = l.frame;
    let any = false;
    for (const f of fills) {
      if (!f.visible) continue;
      const t = this.types[f.type];
      const inst = t && this.instanceOf(f, l);
      if (!t || !inst) continue;
      const canvas = f.fillSpace === 'canvas' && !t.shapeStyle;
      inst.render({
        w: canvas ? DESIGN.w : t.shapeStyle ? fr.w + 2 * pad : fr.w,
        h: canvas ? DESIGN.h : t.shapeStyle ? fr.h + 2 * pad : fr.h,
        scale,
        dt,
        values: this.valuesOf(f, t.schema),
        renderer: this.renderer,
        outline: t.shapeStyle ? this.styleOutline(l, pad) : undefined,
      });
      this.step(pair, (u) => {
        u.uOp.value = OP.fill;
        u.uSrc.value = inst.texture;
        u.uSrcSpace.value = canvas ? 1 : t.shapeStyle ? 2 : 0;
        u.uOpacity.value = f.opacity;
        u.uBlend.value = blendOf(f.blend);
      });
      any = true;
    }
    return any;
  }

  // A blur of `src` (`radius` design units) into `this.blurs[1]`.
  private blur(src: THREE.Texture, radius: number, opaque: boolean) {
    const u = this.blurPass.uniforms;
    const r = radius * (this.px.w / DESIGN.w);
    u.uRadius.value = r;
    u.uOpaque.value = opaque;
    u.uSrc.value = src;
    u.uStep.value.set(1 / this.px.w, 0);
    this.draw(this.blurPass, this.blurs[0]);
    u.uOpaque.value = false;
    u.uSrc.value = this.blurs[0].texture;
    u.uStep.value.set(0, 1 / this.px.h);
    this.draw(this.blurPass, this.blurs[1]);
    return this.blurs[1].texture;
  }

  // Run the layer's filters on what's in `pair[0]`. A background filter reads
  // `base`, the artwork behind the layer, and lays its result over.
  private runFilters(l: LayerDoc, pair: Pair, base: THREE.Texture) {
    const pad = this.padFor(l);
    for (const f of filtersOf(l)) {
      const def = FILTERS[f.type];
      if (!f.visible || !def) continue;
      const v = this.valuesOf(f, def.schema);
      const input = f.input === 'background' ? 1 : 0;
      if (f.type === 'blur') {
        const r = Number(v.radius) || 0;
        const src = input ? base : pair[0].texture;
        const out = r > 0 ? this.blur(src, r, !!input) : src;
        this.step(pair, (u) => {
          u.uOp.value = OP.texture;
          u.uSrc.value = out;
          u.uInput.value = input;
        });
        continue;
      }
      const grid = this.gridOf(l, pad);
      const n = Number(v.cells) || 1;
      this.step(pair, (u) => {
        u.uOp.value = OP[f.type as keyof typeof OP];
        u.uInput.value = input;
        u.uBase.value = base;
        u.uGrid.value.set(grid.x, grid.y, grid.w, grid.h);
        u.uGridRot.value = (grid.rot * Math.PI) / 180;
        u.uCells.value.set(n, (n * grid.h) / grid.w);
        u.uAmount.value = Math.max(
          1e-3,
          Number(v.levels ?? v.level ?? v.scale ?? 1),
        );
        u.uInk.value = rgb(String(v.ink ?? '#000000'));
        u.uPaper.value = rgb(String(v.paper ?? '#ffffff'));
      });
    }
  }

  // The layer's fills and filters, into `pair[0]`. Null if nothing drew.
  private fillsInto(
    l: LayerDoc,
    pair: Pair,
    base: THREE.Texture,
    scale: number,
    dt: number,
  ) {
    this.clear(pair[0]);
    const drew = this.stackFills(l, fillsOf(l), pair, scale, dt);
    const behind = filtersOf(l).some(
      (f) => f.visible && f.input === 'background',
    );
    if (!drew && !behind) return null;
    this.runFilters(l, pair, base);
    return pair[0].texture;
  }

  // The layer's outline as a distance at every pixel, into `this.dist`.
  private distanceOf(l: LayerDoc, layers: LayerDoc[]) {
    const u = this.distPass.uniforms;
    const f = l.frame;
    u.uFrame.value.set(f.x, f.y, f.w, f.h);
    u.uRot.value = (f.rot * Math.PI) / 180;
    const field = this.fieldOf(l);
    u.uShape.value = field.tex;
    u.uShapeMode.value = field.mode;
    u.uPad.value = field.pad;
    const opFrames = [u.uOpFrame0, u.uOpFrame1, u.uOpFrame2];
    const opTex = [u.uOp0, u.uOp1, u.uOp2];
    const axis = ['x', 'y', 'z'] as const;
    const c = this.combineOf(l, layers);
    for (let k = 0; k < 3; k++) {
      const op = c ? OPS.indexOf(String(c[`op${k + 1}`])) : 0;
      const other = c && layers.find((x) => x.id === c[`with${k + 1}`]);
      const on = op > 0 && other && other.id !== l.id;
      u.uOpKind.value[axis[k]] = on ? op : 0;
      opTex[k].value = this.blank;
      u.uOpMode.value[axis[k]] = 0;
      if (!on) continue;
      const of = this.fieldOf(other);
      opTex[k].value = of.tex;
      u.uOpMode.value[axis[k]] = of.mode;
      u.uOpPad.value[axis[k]] = of.pad;
      u.uOpRot.value[axis[k]] = (other.frame.rot * Math.PI) / 180;
      opFrames[k].value.set(
        other.frame.x,
        other.frame.y,
        other.frame.w,
        other.frame.h,
      );
    }
    u.uSmooth.value = c ? Number(c.smooth) || 0 : 0;
    const e = this.edgeOf(l);
    u.uTear.value = e.tear;
    u.uTearScale.value = e.tearScale;
    u.uSeed.value = e.seed;
    this.draw(this.distPass, this.dist);
  }

  // Point the stack pass at layer `l`, with `base` as the artwork behind it.
  private prepare(l: LayerDoc, base: THREE.Texture) {
    const s = this.stackPass.uniforms;
    const fr = l.frame;
    const e = this.edgeOf(l);
    s.uFrame.value.set(fr.x, fr.y, fr.w, fr.h);
    s.uRot.value = (fr.rot * Math.PI) / 180;
    s.uPad.value = this.padFor(l);
    s.uBase.value = base;
    s.uDist.value = this.dist.texture;
    s.uTearScale.value = e.tearScale;
    s.uSeed.value = e.seed;
    s.uFeather.value = e.feather;
  }

  render(dt: number) {
    const doc = this.doc;
    if (!doc) return;
    this.time += dt;
    const scale = this.px.w / DESIGN.w;
    let [a, b] = this.targets;

    this.fill.uniforms.uColor.value = rgb(doc.background);
    this.draw(this.fill, a);

    // Layers used as masks build their fills first and keep them for the
    // frame, even a hidden one, so a matte can be a layer you never see.
    const masks = new Set(doc.layers.map((l) => l.mask.source));
    const matte = new Map<string, THREE.Texture>();
    for (const l of doc.layers) {
      if (!masks.has(l.id)) continue;
      let pair = this.mattes.get(l.id);
      if (!pair) {
        pair = [target(this.px.w, this.px.h), target(this.px.w, this.px.h)];
        this.mattes.set(l.id, pair);
      }
      this.prepare(l, a.texture);
      const tex = this.fillsInto(l, pair, a.texture, scale, dt);
      if (tex) matte.set(l.id, tex);
    }

    const u = this.layerPass.uniforms;
    for (const l of doc.layers) {
      if (!l.visible) continue;
      this.prepare(l, a.texture);
      this.distanceOf(l, doc.layers);

      // A matte's fills are reused unless a filter reads the artwork behind
      // it, which only exists now.
      const pair = this.build;
      const behind = filtersOf(l).some((f) => f.input === 'background');
      const kept = !behind && matte.get(l.id);
      let tex = kept || this.fillsInto(l, pair, a.texture, scale, dt);
      const strokes = strokesOf(l).filter((x) => x.visible);
      if (!tex && !strokes.length) continue;
      if (!tex) {
        this.clear(pair[0]);
        tex = pair[0].texture;
      }

      if (!this.isStyled(l)) {
        // Kept to the outline, then the strokes laid along it.
        const from = tex;
        this.step(pair, (u) => {
          u.uPrev.value = from;
          u.uOp.value = OP.cut;
        });
        for (const st of strokes) {
          this.clear(this.paint[0]);
          if (!this.stackFills(l, st.fills, this.paint, scale, dt)) continue;
          const paint = this.paint[0].texture;
          this.step(pair, (u) => {
            u.uOp.value = OP.stroke;
            u.uSrc.value = paint;
            u.uWidth.value = st.width;
            u.uAlign.value = Math.max(0, ALIGN.indexOf(st.align));
            u.uOffset.value = st.offset;
            u.uFibers.value = st.fibers;
            u.uOpacity.value = st.opacity;
            u.uBlend.value = blendOf(st.blend);
          });
        }
        tex = pair[0].texture;
      }

      u.uBase.value = a.texture;
      u.uLayer.value = tex;
      u.uDist.value = this.dist.texture;
      const shadows = shadowsOf(l)
        .filter((x) => x.visible)
        .slice(0, MAX_SHADOWS);
      u.uShadows.value = shadows.length;
      shadows.forEach((x, i) => {
        u.uShadowGeo.value[i].set(x.x, x.y, x.blur, 0);
        const c = rgb(x.color);
        u.uShadowColor.value[i].set(c.x, c.y, c.z, x.opacity);
      });
      u.uOpacity.value = l.opacity;
      u.uBlend.value = blendOf(l.blend);
      const src = doc.layers.find((m) => m.id === l.mask.source);
      const mtex = src && matte.get(src.id);
      u.uMaskMode.value = mtex ? (l.mask.mode === 'luma' ? 2 : 1) : 0;
      u.uMask.value = mtex ?? tex;
      if (src) {
        // A mask covers wherever its fills were laid: the whole artwork for a
        // canvas-space fill, otherwise its frame.
        const whole = fillsOf(src).some((x) => x.fillSpace === 'canvas');
        u.uMaskFrame.value.set(
          whole ? 0 : src.frame.x,
          whole ? 0 : src.frame.y,
          whole ? DESIGN.w : src.frame.w,
          whole ? DESIGN.h : src.frame.h,
        );
        u.uMaskRot.value = whole ? 0 : (src.frame.rot * Math.PI) / 180;
      }
      u.uMaskInvert.value = l.mask.invert;
      this.draw(this.layerPass, b);
      [a, b] = [b, a];
    }

    const p = this.post.uniforms;
    p.uSrc.value = a.texture;
    p.uRes.value.set(this.px.w, this.px.h);
    p.uTime.value = this.time;
    p.uGrain.value = doc.post.grain;
    p.uGrainSize.value = Math.max(1, doc.post.grainSize * scale);
    p.uVignette.value = doc.post.vignette;
    this.draw(this.post, null);
  }

  // The current frame as a JPEG data URL, `width` pixels across. Rendered
  // and read back in one task, so the drawing buffer hasn't been cleared yet.
  snapshot(width = 800) {
    this.render(0);
    const c = document.createElement('canvas');
    c.width = width;
    c.height = Math.round((width * DESIGN.h) / DESIGN.w);
    c.getContext('2d')!.drawImage(this.canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.86);
  }

  dispose() {
    for (const { inst } of this.instances.values()) inst.dispose();
    this.instances.clear();
    for (const t of this.allTargets()) t.dispose();
    for (const s of this.sdfs.values()) s.rt.dispose();
    this.sdfs.clear();
    this.pts.dispose();
    this.blank.dispose();
    for (const m of [
      this.fill,
      this.distPass,
      this.stackPass,
      this.blurPass,
      this.layerPass,
      this.post,
      this.sdfPass,
    ])
      m.dispose();
    this.quad.geometry.dispose();
    this.renderer.dispose();
  }
}
