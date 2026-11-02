import * as THREE from 'three';
import { defaultsOf, fit } from '@/lab/controls';
import {
  POST_FRAG,
  FILL_FRAG,
  LAYER_FRAG,
  SDF_FRAG,
  VERT,
} from './compositorShaders';
import { BLEND_MODES, DESIGN, type Artwork, type LayerDoc } from './document';
import type { LayerInstance, LayerType } from './layer';
import { flatten, verticesOf, type ShapeDoc } from './shape';
import { combineSchema, edgeSchema } from './studioSchemas';

type Edge = typeof EDGE_DEFAULTS;
const EDGE_DEFAULTS = defaultsOf(edgeSchema);
const OPS = ['none', 'union', 'intersect', 'subtract', 'exclude'];
const MAX_PTS = 4096;
const SDF_MAX_PX = 560;
const STYLE_PAD = 90;

// How far past the frame a layer can draw: the field has to reach as far as
// the furthest effect does.
export const padOf = (e: Edge) =>
  24 +
  e.tear * 1.5 +
  e.stroke +
  e.feather +
  (e.shadow > 0 ? Math.abs(e.shadowX) + Math.abs(e.shadowY) + e.shadowBlur : 0);

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

// The whole artwork in one WebGL context and one canvas. Each layer draws
// itself into a texture; the compositor stacks them bottom to top, ping-ponging
// between two render targets, then runs the post pass onto the canvas.
export class Compositor {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private fill = pass(FILL_FRAG, { uColor: { value: new THREE.Vector3() } });
  private layerPass = pass(LAYER_FRAG, {
    uBase: { value: null },
    uLayer: { value: null },
    uMask: { value: null },
    uDesign: { value: new THREE.Vector2(DESIGN.w, DESIGN.h) },
    uFrame: { value: new THREE.Vector4() },
    uRot: { value: 0 },
    uShape: { value: null },
    uShapeMode: { value: 0 },
    uPad: { value: 0 },
    uFillCanvas: { value: false },
    uStyle: { value: false },
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
    uCore: { value: 0 },
    uFibers: { value: 0 },
    uCoreColor: { value: new THREE.Vector3() },
    uStroke: { value: 0 },
    uStrokeAlign: { value: 1 },
    uStrokeColor: { value: new THREE.Vector3() },
    uFeather: { value: 0 },
    uShadow: { value: 0 },
    uShadowOff: { value: new THREE.Vector2() },
    uShadowBlur: { value: 0 },
    uShadowColor: { value: new THREE.Vector3() },
    uMaskFrame: { value: new THREE.Vector4() },
    uMaskRot: { value: 0 },
    uMaskMode: { value: 0 },
    uMaskInvert: { value: false },
    uOpacity: { value: 1 },
    uBlend: { value: 0 },
    uPixelate: { value: 0 },
    uMono: { value: false },
    uInvert: { value: false },
    uPosterize: { value: 0 },
    uThreshold: { value: 0 },
    uDither: { value: false },
    uDitherScale: { value: 2 },
    uInk: { value: new THREE.Vector3() },
    uPaper: { value: new THREE.Vector3() },
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
    const rt = () =>
      new THREE.WebGLRenderTarget(1, 1, {
        depthBuffer: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
    this.targets = [rt(), rt()];
    this.pts.minFilter = this.pts.magFilter = THREE.NearestFilter;
    this.blank.needsUpdate = true;
  }

  // `width`×`height` CSS pixels on screen; the artwork's aspect is the
  // caller's job.
  setSize(width: number, height: number, dpr: number) {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.px = { w: Math.round(width * dpr), h: Math.round(height * dpr) };
    for (const t of this.targets) t.setSize(this.px.w, this.px.h);
  }

  // Cheap to call every time the document changes: instances are kept by
  // layer id and only created or disposed when a layer appears, disappears
  // or changes type.
  setDocument(doc: Artwork, types: Record<string, LayerType>) {
    this.doc = doc;
    this.types = types;
    const ids = new Set(doc.layers.map((l) => l.id));
    for (const [id, e] of this.instances) {
      const l = doc.layers.find((x) => x.id === id);
      if (!ids.has(id) || l?.type !== e.type) {
        e.inst.dispose();
        this.instances.delete(id);
      }
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

  // A shape style draws stickers and labels past its outline, so it gets
  // room beyond what the edge effects need.
  private padFor(l: LayerDoc) {
    const pad = padOf(this.edgeOf(l));
    return this.types[l.type]?.shapeStyle ? pad + STYLE_PAD : pad;
  }

  private outlineOf(s: ShapeDoc, w: number, h: number) {
    const c = this.outlines.get(s);
    if (c && c.w === w && c.h === h) return c.pts;
    const pts = flatten(verticesOf(s, w, h), w, h, 1200);
    this.outlines.set(s, { w, h, pts });
    return pts;
  }

  // The layer's distance field, rebuilt only when its outline, size or pad
  // changes. Mode 0 is a plain frame, worked out exactly in the layer pass.
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
      s = {
        rt: new THREE.WebGLRenderTarget(pw, ph, {
          depthBuffer: false,
          type: THREE.HalfFloatType,
          format: THREE.RGBAFormat,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
        }),
        shape: l.shape,
        w,
        h,
        pad,
      };
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

  private instanceOf(l: LayerDoc) {
    let e = this.instances.get(l.id);
    if (!e) {
      const t = this.types[l.type];
      if (!t) return null;
      if (t.version !== l.version)
        console.warn(
          `[studio] layer "${l.name}" was saved with ${l.type} v${l.version}; now v${t.version}`,
        );
      e = { type: l.type, inst: t.create() };
      this.instances.set(l.id, e);
    }
    return e.inst;
  }

  // Saved values checked against the type's schema, with anything missing or
  // out of range taken from the schema itself — never from an experiment's
  // live store, which would let retuning an experiment reach into saved work.
  private resolved = new WeakMap<object, Record<string, unknown>>();
  private valuesOf(l: LayerDoc, t: LayerType) {
    let v = this.resolved.get(l.values);
    if (!v) {
      v = { ...defaultsOf(t.schema), ...fit(l.values, t.schema) };
      this.resolved.set(l.values, v);
    }
    return v;
  }

  private draw(
    material: THREE.Material,
    target: THREE.WebGLRenderTarget | null,
  ) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  render(dt: number) {
    const doc = this.doc;
    if (!doc) return;
    this.time += dt;
    const scale = this.px.w / DESIGN.w;
    let [a, b] = this.targets;

    this.fill.uniforms.uColor.value = rgb(doc.background);
    this.draw(this.fill, a);

    // Every layer that shows or is used as a mask draws itself this frame,
    // even a hidden one, so a matte can be a layer you never see.
    const masks = new Set(doc.layers.map((l) => l.mask.source));
    const drawn = new Map<string, THREE.Texture>();
    for (const l of doc.layers) {
      if (!l.visible && !masks.has(l.id)) continue;
      const inst = this.instanceOf(l);
      const t = this.types[l.type];
      if (!inst || !t) continue;
      const pad = this.padFor(l);
      const canvas = l.fillSpace === 'canvas' && !t.shapeStyle;
      inst.render({
        w: canvas ? DESIGN.w : t.shapeStyle ? l.frame.w + 2 * pad : l.frame.w,
        h: canvas ? DESIGN.h : t.shapeStyle ? l.frame.h + 2 * pad : l.frame.h,
        scale,
        dt,
        values: this.valuesOf(l, t),
        renderer: this.renderer,
        outline: t.shapeStyle ? this.styleOutline(l, pad) : undefined,
      });
      drawn.set(l.id, inst.texture);
    }

    const u = this.layerPass.uniforms;
    const opFrames = [u.uOpFrame0, u.uOpFrame1, u.uOpFrame2];
    const opTex = [u.uOp0, u.uOp1, u.uOp2];
    const axis = ['x', 'y', 'z'] as const;
    for (const l of doc.layers) {
      const tex = drawn.get(l.id);
      if (!l.visible || !tex) continue;
      const { frame: f, fx } = l;
      const t = this.types[l.type];
      u.uBase.value = a.texture;
      u.uLayer.value = tex;
      u.uFrame.value.set(f.x, f.y, f.w, f.h);
      u.uRot.value = (f.rot * Math.PI) / 180;

      const field = this.fieldOf(l);
      u.uShape.value = field.tex;
      u.uShapeMode.value = field.mode;
      u.uPad.value = field.pad;
      u.uStyle.value = !!t?.shapeStyle;
      u.uFillCanvas.value = l.fillSpace === 'canvas' && !t?.shapeStyle;

      const c = this.combineOf(l, doc.layers);
      for (let k = 0; k < 3; k++) {
        const op = c ? OPS.indexOf(String(c[`op${k + 1}`])) : 0;
        const other = c && doc.layers.find((x) => x.id === c[`with${k + 1}`]);
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
      u.uCore.value = e.core;
      u.uFibers.value = e.fibers;
      u.uCoreColor.value = rgb(e.coreColor);
      u.uStroke.value = e.stroke;
      u.uStrokeAlign.value = ['inside', 'center', 'outside'].indexOf(
        e.strokeAlign,
      );
      u.uStrokeColor.value = rgb(e.strokeColor);
      u.uFeather.value = e.feather;
      u.uShadow.value = e.shadow;
      u.uShadowOff.value.set(e.shadowX, e.shadowY);
      u.uShadowBlur.value = e.shadowBlur;
      u.uShadowColor.value = rgb(e.shadowColor);
      u.uOpacity.value = l.opacity;
      u.uBlend.value = Math.max(0, BLEND_MODES.indexOf(l.blend));
      const src = doc.layers.find((m) => m.id === l.mask.source);
      const mtex = src && drawn.get(src.id);
      u.uMaskMode.value = mtex ? (l.mask.mode === 'luma' ? 2 : 1) : 0;
      u.uMask.value = mtex ?? tex;
      if (src) {
        // A mask's texture covers wherever it was drawn: the whole artwork
        // for a canvas-space fill, otherwise its frame.
        const whole = src.fillSpace === 'canvas';
        u.uMaskFrame.value.set(
          whole ? 0 : src.frame.x,
          whole ? 0 : src.frame.y,
          whole ? DESIGN.w : src.frame.w,
          whole ? DESIGN.h : src.frame.h,
        );
        u.uMaskRot.value = whole ? 0 : (src.frame.rot * Math.PI) / 180;
      }
      u.uMaskInvert.value = l.mask.invert;
      u.uPixelate.value = fx.pixelate;
      u.uMono.value = fx.mono;
      u.uInvert.value = fx.invert;
      u.uPosterize.value = fx.posterize;
      u.uThreshold.value = fx.threshold;
      u.uDither.value = fx.dither;
      u.uDitherScale.value = Math.max(0.5, fx.ditherScale);
      u.uInk.value = rgb(fx.ink);
      u.uPaper.value = rgb(fx.paper);
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
    for (const t of this.targets) t.dispose();
    for (const s of this.sdfs.values()) s.rt.dispose();
    this.sdfs.clear();
    this.pts.dispose();
    this.blank.dispose();
    for (const m of [this.fill, this.layerPass, this.post, this.sdfPass])
      m.dispose();
    this.quad.geometry.dispose();
    this.renderer.dispose();
  }
}
