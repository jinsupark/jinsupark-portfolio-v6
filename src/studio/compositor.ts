import * as THREE from 'three';
import { defaultsOf, fit } from '@/lab/controls';
import {
  BLUR_FRAG,
  DIST_FRAG,
  FILL_FRAG,
  GROUP_FRAG,
  LAYER_FRAG,
  POST_FRAG,
  SDF_FRAG,
  STACK_FRAG,
  VERT,
} from './compositorShaders';
import {
  BLEND_MODES,
  boundsOf,
  chainOf,
  DESIGN,
  sizeOf,
  fillsOf,
  filtersOf,
  layersIn,
  plainFolder,
  outlineOf,
  shadowsOf,
  strokesOf,
  type Artwork,
  type FillDoc,
  type GroupDoc,
  type Frame,
  type LayerDoc,
  type Size,
  type StrokeDoc,
} from './document';
import type { LayerInstance, LayerType } from './layer';
import { flatten, verticesOf, type ShapeDoc } from './shape';
import { combineSchema, FILTERS, OUTLINES } from './studioSchemas';

type Pair = [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
const MAX_TEARS = 4;
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
  grain: 10,
  vignette: 11,
} as const;
const ALIGN = ['inside', 'center', 'outside'];
const blendOf = (b: string) =>
  Math.max(0, BLEND_MODES.indexOf(b as (typeof BLEND_MODES)[number]));

// How much a stroke's width wobbles: only paper fibres do.
const fibresOf = (s: StrokeDoc) => (s.type === 'fibres' ? s.fibers : 0);

// How far past the frame a layer can draw: the field has to reach as far as
// the furthest stroke or shadow does.
// A layer's outline effects in the form the passes use: its visible tears
// (up to four), their total, its total feather, and the first tear's
// frequency and seed, which paper-fibre borders follow.
type Outline = {
  tears: { amount: number; scale: number; seed: number }[];
  tear: number;
  feather: number;
  tearScale: number;
  seed: number;
};
const outlines = new WeakMap<LayerDoc, Outline>();
export function outlineSum(l: LayerDoc): Outline {
  let o = outlines.get(l);
  if (o) return o;
  const tears: Outline['tears'] = [];
  let feather = 0;
  for (const x of outlineOf(l)) {
    const def = OUTLINES[x.type];
    if (!x.visible || !def) continue;
    const v = { ...defaultsOf(def.schema), ...fit(x.values, def.schema) };
    if (x.type === 'tear' && tears.length < MAX_TEARS)
      tears.push({
        amount: Number(v.amount),
        scale: Number(v.scale),
        seed: Number(v.seed),
      });
    if (x.type === 'feather') feather += Number(v.amount);
  }
  o = {
    tears,
    tear: tears.reduce((t, x) => t + x.amount, 0),
    feather,
    tearScale: tears[0]?.scale ?? 0.06,
    seed: tears[0]?.seed ?? 1,
  };
  outlines.set(l, o);
  return o;
}

export function padOf(l: LayerDoc) {
  const e = outlineSum(l);
  let reach = 0;
  for (const s of strokesOf(l)) {
    if (!s.visible) continue;
    const w = s.width * (1 + fibresOf(s));
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

const COPY_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uSrc;
in vec2 vUv;
out vec4 outColor;
void main() { outColor = texture(uSrc, vUv); }`;

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
    uView: { value: new THREE.Vector4(0, 0, DESIGN.w, DESIGN.h) },
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
    uTears: { value: 0 },
    uTear: {
      value: Array.from({ length: MAX_TEARS }, () => new THREE.Vector4()),
    },
  });
  private stackPass = pass(STACK_FRAG, {
    uPrev: { value: null },
    uBase: { value: null },
    uSrc: { value: null },
    uDist: { value: null },
    uDesign: { value: new THREE.Vector2(DESIGN.w, DESIGN.h) },
    uView: { value: new THREE.Vector4(0, 0, DESIGN.w, DESIGN.h) },
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
    uSide: { value: 0 },
    uGrainPx: { value: 1 },
    uTime: { value: 0 },
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
    uView: { value: new THREE.Vector4(0, 0, DESIGN.w, DESIGN.h) },
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
  private groupPass = pass(GROUP_FRAG, {
    uBase: { value: null },
    uSrc: { value: null },
    uMask: { value: null },
    uView: { value: new THREE.Vector4(0, 0, DESIGN.w, DESIGN.h) },
    uMode: { value: 0 },
    uOffset: { value: new THREE.Vector2() },
    uColor: { value: new THREE.Vector4() },
    uMaskMode: { value: 0 },
    uMaskInvert: { value: false },
    uMaskFrame: { value: new THREE.Vector4() },
    uMaskRot: { value: 0 },
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
    uView: { value: new THREE.Vector4(0, 0, DESIGN.w, DESIGN.h) },
    uDesign: { value: new THREE.Vector2(DESIGN.w, DESIGN.h) },
    uSurround: { value: new THREE.Vector3(0.64, 0.64, 0.64) },
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
  // A folder that's blended, filtered, masked or shadowed composites its
  // layers here first, one pair per level of nesting.
  private folders: Pair[] = [];
  // Mid-drag, the artwork under the first layer that changed, drawn once and
  // reused while those layers stay the same (keyed by them and the view).
  private below = target();
  private belowKey: unknown[] | null = null;
  private lastLayers: LayerDoc[] = [];
  private copyPass = pass(COPY_FRAG, { uSrc: { value: null } });

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
  // The artwork's size, and the part of it this canvas shows (design units).
  private size: Size = DESIGN;
  private view: Frame | null = null;
  private surround = '#a3a3a3';

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
  // Whether something changed since the last frame, for a player that only
  // renders on change while its animation is paused.
  dirty = true;
  // While something is dragged: animation stops and unchanged layers keep
  // their last drawing, so each frame is only the compositing passes.
  hold = false;

  setSize(width: number, height: number, dpr: number) {
    this.dirty = true;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.px = { w: Math.round(width * dpr), h: Math.round(height * dpr) };
    for (const t of this.allTargets()) t.setSize(this.px.w, this.px.h);
  }

  // Show only `view` of the artwork (design units), for panning and zooming,
  // with `surround` painted where the view runs past the artwork. Null shows
  // the whole artwork, which the canvas is then expected to match in aspect.
  setView(view: Frame | null, surround = this.surround) {
    const v = this.view;
    if (
      !view !== !v ||
      (view &&
        v &&
        (v.x !== view.x || v.y !== view.y || v.w !== view.w || v.h !== view.h))
    )
      this.dirty = true;
    if (surround !== this.surround) this.dirty = true;
    this.view = view;
    this.surround = surround;
  }

  private viewOf(): Frame {
    return this.view ?? { x: 0, y: 0, ...this.size, rot: 0 };
  }

  private allTargets() {
    return [
      ...this.targets,
      ...this.build,
      ...this.paint,
      ...this.blurs,
      this.dist,
      ...[...this.mattes.values()].flat(),
      ...this.folders.flat(),
      this.below,
    ];
  }

  // Cheap to call every time the document changes: instances are kept by
  // fill id and only created or disposed when a fill appears, disappears or
  // changes type.
  setDocument(doc: Artwork, types: Record<string, LayerType>) {
    this.dirty = true;
    this.doc = doc;
    this.types = types;
    this.size = sizeOf(doc);
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

  // A layer with a shape-style fill (Node path) is drawn from its outline
  // rather than cut to it.
  private isStyled(l: LayerDoc) {
    return fillsOf(l).some((f) => f.visible && this.types[f.type]?.shapeStyle);
  }

  // A shape style draws stickers and labels past its outline, so it gets
  // room beyond what the edge effects need.
  private padFor(l: LayerDoc) {
    const pad = padOf(l);
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
      return { x: 0, y: 0, ...this.size, rot: 0 };
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
        w: canvas ? this.size.w : t.shapeStyle ? fr.w + 2 * pad : fr.w,
        h: canvas ? this.size.h : t.shapeStyle ? fr.h + 2 * pad : fr.h,
        scale,
        dt: this.hold ? 0 : dt,
        values: this.valuesOf(f, t.schema),
        renderer: this.renderer,
        hold: this.hold,
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
    const r = radius * (this.px.w / this.viewOf().w);
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
        u.uAmount.value =
          f.type === 'grain' || f.type === 'vignette'
            ? Number(v.amount)
            : Math.max(1e-3, Number(v.levels ?? v.level ?? v.scale ?? 1));
        u.uGrainPx.value = Number(v.size ?? 1) * (this.px.w / this.viewOf().w);
        u.uTime.value = this.time;
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
    const o = outlineSum(l);
    u.uTears.value = o.tears.length;
    o.tears.forEach((t, i) =>
      u.uTear.value[i].set(t.amount, t.scale, t.seed, 0),
    );
    this.draw(this.distPass, this.dist);
  }

  // Point the stack pass at layer `l`, with `base` as the artwork behind it.
  private prepare(l: LayerDoc, base: THREE.Texture) {
    const s = this.stackPass.uniforms;
    const fr = l.frame;
    const e = outlineSum(l);
    s.uFrame.value.set(fr.x, fr.y, fr.w, fr.h);
    s.uRot.value = (fr.rot * Math.PI) / 180;
    s.uPad.value = this.padFor(l);
    s.uBase.value = base;
    s.uDist.value = this.dist.texture;
    s.uTearScale.value = e.tearScale;
    s.uSeed.value = e.seed;
    s.uFeather.value = e.feather;
  }

  // Only the part of the view the artwork covers (plus a margin for blurs and
  // offsets) is worth drawing; the rest is surround, which the post pass
  // paints. Scissoring the view-sized buffers keeps a zoomed-out or panned
  // view as cheap as the artwork alone.
  private clipTo(view: Frame) {
    const sx = this.px.w / view.w;
    const sy = this.px.h / view.h;
    const m = 48;
    const x0 = Math.max(0, Math.floor(-view.x * sx) - m);
    const x1 = Math.min(this.px.w, Math.ceil((this.size.w - view.x) * sx) + m);
    const top = Math.max(0, Math.floor(-view.y * sy) - m);
    const bottom = Math.min(
      this.px.h,
      Math.ceil((this.size.h - view.y) * sy) + m,
    );
    const clip = x1 - x0 < this.px.w || bottom - top < this.px.h;
    for (const t of this.allTargets()) {
      t.scissorTest = clip;
      // GL counts rows from the bottom.
      t.scissor.set(
        x0,
        this.px.h - bottom,
        Math.max(0, x1 - x0),
        Math.max(0, bottom - top),
      );
    }
  }

  // A folder as a layer, for the passes its filters run through: its box is
  // its layers' box.
  private folderLayer(doc: Artwork, g: GroupDoc): LayerDoc {
    const frame = boundsOf(layersIn(doc, g.id).map((x) => x.frame)) ?? {
      x: 0,
      y: 0,
      ...this.size,
      rot: 0,
    };
    return {
      id: `g:${g.id}`,
      name: g.name,
      visible: true,
      frame,
      opacity: 1,
      blend: 'normal',
      mask: { source: null, mode: 'alpha', invert: false },
      fills: [],
      filters: g.filters ?? [],
      strokes: [],
      shadows: [],
      outline: [],
    };
  }

  render(dt: number) {
    const doc = this.doc;
    if (!doc) return;
    this.time += dt;
    const view = this.viewOf();
    // Pixels per design unit; layer textures are drawn at this, so zooming in
    // sharpens them (each capped by its own maximum size).
    const scale = this.px.w / view.w;
    for (const m of [
      this.distPass,
      this.stackPass,
      this.layerPass,
      this.post,
    ]) {
      m.uniforms.uDesign.value.set(this.size.w, this.size.h);
      m.uniforms.uView.value.set(view.x, view.y, view.w, view.h);
    }
    this.groupPass.uniforms.uView.value.set(view.x, view.y, view.w, view.h);
    this.clipTo(view);
    const a = this.targets[0];

    this.fill.uniforms.uColor.value = rgb(doc.background);
    this.draw(this.fill, a);

    // Layers used as masks build their fills first and keep them for the
    // frame, even a hidden one, so a matte can be a layer you never see.
    const masks = new Set([
      ...doc.layers.map((l) => l.mask.source),
      ...(doc.groups ?? []).map((g) => g.mask?.source),
    ]);
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
    // One layer onto `into`'s current content (the artwork, or a folder's
    // layers so far).
    const drawLayer = (l: LayerDoc, into: Pair) => {
      const base = into[0];
      this.prepare(l, base.texture);
      this.distanceOf(l, doc.layers);

      // A matte's fills are reused unless a filter reads the artwork behind
      // it, which only exists now.
      const pair = this.build;
      const behind = filtersOf(l).some((f) => f.input === 'background');
      const kept = !behind && matte.get(l.id);
      let tex = kept || this.fillsInto(l, pair, base.texture, scale, dt);
      const strokes = strokesOf(l).filter((x) => x.visible);
      if (!tex && !strokes.length) return;
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
            u.uFibers.value = fibresOf(st);
            u.uSide.value = Math.max(
              0,
              ['all', 'top', 'bottom', 'left', 'right'].indexOf(
                st.sides ?? 'all',
              ),
            );
            u.uOpacity.value = st.opacity;
            u.uBlend.value = blendOf(st.blend);
          });
        }
        tex = pair[0].texture;
      }

      u.uBase.value = base.texture;
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
          whole ? this.size.w : src.frame.w,
          whole ? this.size.h : src.frame.h,
        );
        u.uMaskRot.value = whole ? 0 : (src.frame.rot * Math.PI) / 180;
      }
      u.uMaskInvert.value = l.mask.invert;

      this.draw(this.layerPass, into[1]);
      into.reverse();
    };

    // Folders open and close as the layers under them go by. A plain one draws
    // straight into its parent; one with effects gets a buffer of its own,
    // laid onto its parent when it closes.
    type Open = { g: GroupDoc | null; pair: Pair; own: boolean };
    const stack: Open[] = [{ g: null, pair: this.targets, own: false }];
    const openFolder = (g: GroupDoc) => {
      const top = stack[stack.length - 1];
      if (plainFolder(g)) {
        stack.push({ g, pair: top.pair, own: false });
        return;
      }
      const depth = stack.filter((f) => f.own).length;
      const pair = (this.folders[depth] ??= [
        target(this.px.w, this.px.h),
        target(this.px.w, this.px.h),
      ]);
      this.clipTo(view);
      this.clear(pair[0]);
      stack.push({ g, pair, own: true });
    };
    const closeFolder = () => {
      const f = stack.pop()!;
      if (!f.own || !f.g) return;
      const g = f.g;
      const into = stack[stack.length - 1].pair;
      const gl = this.folderLayer(doc, g);
      this.prepare(gl, into[0].texture);
      this.runFilters(gl, f.pair, into[0].texture);
      const gu = this.groupPass.uniforms;
      const src = doc.layers.find((m) => m.id === g.mask?.source);
      const mtex = src && matte.get(src.id);
      gu.uMaskMode.value = mtex ? (g.mask?.mode === 'luma' ? 2 : 1) : 0;
      gu.uMask.value = mtex ?? f.pair[0].texture;
      gu.uMaskInvert.value = !!g.mask?.invert;
      if (src) {
        const whole = fillsOf(src).some((x) => x.fillSpace === 'canvas');
        gu.uMaskFrame.value.set(
          whole ? 0 : src.frame.x,
          whole ? 0 : src.frame.y,
          whole ? this.size.w : src.frame.w,
          whole ? this.size.h : src.frame.h,
        );
        gu.uMaskRot.value = whole ? 0 : (src.frame.rot * Math.PI) / 180;
      }
      gu.uOpacity.value = g.opacity ?? 1;
      for (const sh of (g.shadows ?? []).filter((x) => x.visible)) {
        gu.uMode.value = 1;
        gu.uSrc.value = this.blur(f.pair[0].texture, sh.blur / 2, false);
        gu.uOffset.value.set(sh.x, sh.y);
        const c = rgb(sh.color);
        gu.uColor.value.set(c.x, c.y, c.z, sh.opacity);
        gu.uBase.value = into[0].texture;
        gu.uBlend.value = 0;
        this.draw(this.groupPass, into[1]);
        into.reverse();
      }
      gu.uMode.value = 0;
      gu.uSrc.value = f.pair[0].texture;
      gu.uBase.value = into[0].texture;
      gu.uBlend.value = blendOf(g.blend ?? 'normal');
      this.draw(this.groupPass, into[1]);
      into.reverse();
    };

    // Mid-drag, start from the kept picture of everything under the first
    // layer that changed, if those layers and the view are as they were.
    // Folders with effects composite apart, so they always draw in full.
    let from = 0;
    let keepAt = -1;
    if (this.hold && !(doc.groups ?? []).some((g) => !plainFolder(g))) {
      const prev = this.lastLayers;
      const changed = doc.layers.findIndex((l, i) => prev[i] !== l);
      const first = changed < 0 ? doc.layers.length : changed;
      const key = [
        doc.background,
        view.x,
        view.y,
        view.w,
        view.h,
        this.px.w,
        this.px.h,
        ...doc.layers.slice(0, first),
      ];
      const k = this.belowKey;
      if (k && k.length === key.length && key.every((x, i) => x === k[i])) {
        from = first;
        this.copyPass.uniforms.uSrc.value = this.below.texture;
        this.draw(this.copyPass, this.targets[0]);
      } else {
        keepAt = first;
        this.belowKey = key;
      }
    } else this.belowKey = null;
    this.lastLayers = doc.layers;
    const keep = () => {
      this.copyPass.uniforms.uSrc.value = this.targets[0].texture;
      this.draw(this.copyPass, this.below);
    };

    for (const [index, l] of doc.layers.entries()) {
      if (index === keepAt) keep();
      if (index < from) continue;
      const chain = chainOf(doc, l);
      if (!l.visible || chain.some((g) => g.visible === false)) continue;
      while (
        stack.length > 1 &&
        !chain.some((g) => g.id === stack[stack.length - 1].g?.id)
      )
        closeFolder();
      for (const g of chain)
        if (!stack.some((f) => f.g?.id === g.id)) openFolder(g);
      drawLayer(l, stack[stack.length - 1].pair);
    }
    while (stack.length > 1) closeFolder();
    if (keepAt === doc.layers.length) keep();

    const p = this.post.uniforms;
    p.uSrc.value = this.targets[0].texture;
    p.uRes.value.set(this.px.w, this.px.h);
    p.uTime.value = this.time;
    // Grain and vignette are filters now; the old post settings are ignored.
    p.uGrain.value = 0;
    p.uGrainSize.value = 1;
    p.uVignette.value = 0;
    p.uSurround.value = rgb(this.surround);
    this.draw(this.post, null);
  }

  // The current frame as a JPEG data URL, `width` pixels across. Rendered
  // and read back in one task, so the drawing buffer hasn't been cleared yet.
  snapshot(width = 800) {
    this.render(0);
    const c = document.createElement('canvas');
    c.width = width;
    c.height = Math.round((width * this.size.h) / this.size.w);
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
      this.groupPass,
      this.copyPass,
      this.post,
      this.sdfPass,
    ])
      m.dispose();
    this.quad.geometry.dispose();
    this.renderer.dispose();
  }
}
