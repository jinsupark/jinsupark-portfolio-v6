// Water you draw: every shape is filled into a mask, the mask is blurred on
// the GPU into a height field, and one full-screen pass refracts the backdrop
// through that surface — slope bends it, the rim catches light, the body
// casts a tinted shadow with a caustic at its edge.
//
// Shapes are stored in viewport fractions, so a resize keeps them in place.

import * as THREE from 'three';
import { DemoVideos } from '@/lab/demoVideo';
import { seededRng } from '@/lab/random';
import { Backdrop } from './backdrop';
import type { DropletValues } from './dropletControls';
import { blurFrag, quadVert, waterFrag } from './dropletShaders';

type P = { x: number; y: number };
type Shape =
  | { kind: 'fill'; pts: P[] }
  | { kind: 'stroke'; pts: P[]; width: number }
  | { kind: 'drop'; at: P; r: number };

// The mask and height field run at half the CSS resolution; the blur hides it.
const MASK_SCALE = 0.5;

export class DropletRenderer {
  private gl: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private blur: THREE.ShaderMaterial;
  private water: THREE.ShaderMaterial;
  private mask = document.createElement('canvas');
  private maskTex: THREE.CanvasTexture;
  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;
  private backdrop = new Backdrop();
  private bgTex: THREE.CanvasTexture;
  private videos = new DemoVideos();
  private videoTex: THREE.VideoTexture | null = null;

  private shapes: Shape[] = [];
  private current: Shape | null = null;
  private dirty = true;
  private starterKey = '';
  private W = 1;
  private H = 1;
  private time = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.maskTex = new THREE.CanvasTexture(this.mask);
    this.bgTex = new THREE.CanvasTexture(this.backdrop.canvas);
    for (const t of [this.maskTex, this.bgTex]) {
      t.generateMipmaps = false;
      t.minFilter = THREE.LinearFilter;
    }
    const rt = () =>
      new THREE.WebGLRenderTarget(1, 1, {
        type: THREE.HalfFloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
      });
    this.rtA = rt();
    this.rtB = rt();
    this.blur = new THREE.ShaderMaterial({
      vertexShader: quadVert,
      fragmentShader: blurFrag,
      uniforms: {
        tIn: { value: null },
        dir: { value: new THREE.Vector2() },
        radius: { value: 1 },
      },
    });
    this.water = new THREE.ShaderMaterial({
      vertexShader: quadVert,
      fragmentShader: waterFrag,
      uniforms: {
        tBg: { value: this.bgTex },
        tH: { value: this.rtB.texture },
        res: { value: new THREE.Vector2() },
        texel: { value: new THREE.Vector2() },
        fit: { value: new THREE.Vector2(1, 1) },
        time: { value: 0 },
        thickness: { value: 0 },
        refract: { value: 0 },
        parallax: { value: 0 },
        chroma: { value: 0 },
        wobble: { value: 0 },
        specular: { value: 0 },
        shininess: { value: 1 },
        rim: { value: 0 },
        rimDark: { value: 0 },
        light: { value: new THREE.Vector2() },
        tint: { value: new THREE.Color() },
        tintAmt: { value: 0 },
        shadow: { value: 0 },
        shadowOff: { value: new THREE.Vector2() },
        shadowColor: { value: new THREE.Color() },
        caustics: { value: 0 },
      },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.water);
    this.scene.add(this.quad);
  }

  // Drawing. Points arrive in CSS pixels.
  begin(x: number, y: number, v: DropletValues) {
    const p = { x: x / this.W, y: y / this.H };
    this.current =
      v.mode === 'brush'
        ? { kind: 'stroke', pts: [p], width: v.brush }
        : { kind: 'fill', pts: [p] };
    this.dirty = true;
  }

  extend(x: number, y: number) {
    const c = this.current;
    if (!c || c.kind === 'drop') return;
    const last = c.pts[c.pts.length - 1];
    if (
      Math.hypot(
        (x / this.W - last.x) * this.W,
        (y / this.H - last.y) * this.H,
      ) < 3
    )
      return;
    c.pts.push({ x: x / this.W, y: y / this.H });
    this.dirty = true;
  }

  end(v: DropletValues) {
    const c = this.current;
    this.current = null;
    if (!c || c.kind === 'drop') return;
    let len = 0;
    for (let i = 1; i < c.pts.length; i++)
      len += Math.hypot(
        (c.pts[i].x - c.pts[i - 1].x) * this.W,
        (c.pts[i].y - c.pts[i - 1].y) * this.H,
      );
    // A click, or a scribble too small to hold water, is a single drop.
    this.shapes.push(
      len < 10 || (c.kind === 'fill' && c.pts.length < 4)
        ? { kind: 'drop', at: c.pts[0], r: v.dropSize }
        : c,
    );
    this.dirty = true;
  }

  undo() {
    this.shapes.pop();
    this.dirty = true;
  }

  clear() {
    this.shapes = [];
    this.dirty = true;
  }

  // A few drops to start from, so the effect is there before you draw.
  private starters(seed: number) {
    const r = seededRng(seed * 523 + 11);
    const blob = (cx: number, cy: number, R: number): Shape => {
      const a = r() * 6.28;
      const b = r() * 6.28;
      const pts: P[] = [];
      for (let i = 0; i < 64; i++) {
        const t = (i / 64) * Math.PI * 2;
        const k = 1 + 0.22 * Math.sin(2 * t + a) + 0.12 * Math.sin(3 * t + b);
        pts.push({
          x: cx + (Math.cos(t) * R * k) / this.W,
          y: cy + (Math.sin(t) * R * k) / this.H,
        });
      }
      return { kind: 'fill', pts };
    };
    const m = Math.min(this.W, this.H);
    const out: Shape[] = [
      blob(0.3 + r() * 0.15, 0.35 + r() * 0.2, m * 0.2),
      blob(0.68 + r() * 0.1, 0.3 + r() * 0.2, m * 0.15),
    ];
    const snake: P[] = [];
    const sx = 0.5 + (r() - 0.5) * 0.2;
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      snake.push({
        x: sx + (Math.sin(t * 9 + r() * 0.1) * m * 0.05) / this.W,
        y: 0.45 + t * 0.4,
      });
    }
    out.push({ kind: 'stroke', pts: snake, width: 30 });
    for (let i = 0; i < 4; i++)
      out.push({
        kind: 'drop',
        at: { x: 0.1 + r() * 0.8, y: 0.1 + r() * 0.8 },
        r: 12 + r() * 22,
      });
    return out;
  }

  private paintMask() {
    const g = this.mask.getContext('2d')!;
    const sx = this.mask.width;
    const sy = this.mask.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000';
    g.fillRect(0, 0, sx, sy);
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const trace = (pts: P[], close: boolean) => {
      g.beginPath();
      g.moveTo(pts[0].x * sx, pts[0].y * sy);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = ((pts[i].x + pts[i + 1].x) / 2) * sx;
        const my = ((pts[i].y + pts[i + 1].y) / 2) * sy;
        g.quadraticCurveTo(pts[i].x * sx, pts[i].y * sy, mx, my);
      }
      const l = pts[pts.length - 1];
      g.lineTo(l.x * sx, l.y * sy);
      if (close) g.closePath();
    };
    const all = this.current ? [...this.shapes, this.current] : this.shapes;
    for (const s of all) {
      if (s.kind === 'drop') {
        g.beginPath();
        g.arc(s.at.x * sx, s.at.y * sy, s.r * MASK_SCALE, 0, Math.PI * 2);
        g.fill();
      } else if (s.kind === 'fill') {
        if (s.pts.length < 2) continue;
        trace(s.pts, true);
        g.fill();
      } else {
        g.lineWidth = s.width * MASK_SCALE;
        if (s.pts.length === 1) {
          g.beginPath();
          g.arc(
            s.pts[0].x * sx,
            s.pts[0].y * sy,
            g.lineWidth / 2,
            0,
            Math.PI * 2,
          );
          g.fill();
        } else {
          trace(s.pts, false);
          g.stroke();
        }
      }
    }
    this.maskTex.needsUpdate = true;
  }

  frame(W: number, H: number, dpr: number, wallDt: number, v: DropletValues) {
    if (W !== this.W || H !== this.H || this.gl.getPixelRatio() !== dpr) {
      this.W = W;
      this.H = H;
      this.gl.setPixelRatio(dpr);
      this.gl.setSize(W, H, false);
      this.mask.width = Math.max(1, Math.round(W * MASK_SCALE));
      this.mask.height = Math.max(1, Math.round(H * MASK_SCALE));
      this.rtA.setSize(this.mask.width, this.mask.height);
      this.rtB.setSize(this.mask.width, this.mask.height);
      this.maskTex.dispose();
      this.dirty = true;
    }
    const sk = `${v.seed}|${v.starters}`;
    if (sk !== this.starterKey) {
      this.starterKey = sk;
      this.shapes = v.starters ? this.starters(v.seed) : [];
      this.dirty = true;
    }

    const u = this.water.uniforms;
    if (v.backdrop === 'video') {
      const el = this.videos.get(0);
      if (DemoVideos.ready(el)) {
        if (!this.videoTex || this.videoTex.image !== el) {
          this.videoTex?.dispose();
          this.videoTex = new THREE.VideoTexture(el);
          this.videoTex.generateMipmaps = false;
        }
        u.tBg.value = this.videoTex;
        const a = W / H;
        const b = el.videoWidth / el.videoHeight;
        u.fit.value.set(b > a ? a / b : 1, b > a ? 1 : b / a);
      }
    } else {
      if (
        this.backdrop.update(
          W,
          H,
          Math.min(dpr, 2),
          v.seed,
          v.tiles,
          v.backdrop,
        )
      ) {
        this.bgTex.dispose();
        this.bgTex.needsUpdate = true;
      }
      u.tBg.value = this.bgTex;
      u.fit.value.set(1, 1);
    }

    if (this.dirty) {
      this.dirty = false;
      this.paintMask();
      const radius = Math.max(1, v.edge * MASK_SCALE);
      const b = this.blur.uniforms;
      this.quad.material = this.blur;
      b.radius.value = radius;
      b.tIn.value = this.maskTex;
      b.dir.value.set(1 / this.mask.width, 0);
      this.gl.setRenderTarget(this.rtA);
      this.gl.render(this.scene, this.camera);
      b.tIn.value = this.rtA.texture;
      b.dir.value.set(0, 1 / this.mask.height);
      this.gl.setRenderTarget(this.rtB);
      this.gl.render(this.scene, this.camera);
      this.gl.setRenderTarget(null);
      this.quad.material = this.water;
    }

    this.time += Math.min(wallDt, 0.1) * v.wobbleSpeed;
    const la = (v.lightAngle * Math.PI) / 180;
    u.res.value.set(W, H);
    u.texel.value.set(1 / this.mask.width, 1 / this.mask.height);
    u.time.value = this.time;
    u.thickness.value = v.thickness;
    u.refract.value = v.refract;
    u.parallax.value = v.parallax;
    u.chroma.value = v.chroma;
    u.wobble.value = v.wobble;
    u.specular.value = v.specular;
    u.shininess.value = v.shininess;
    u.rim.value = v.rim;
    u.rimDark.value = v.rimDark;
    // The angle is measured on screen (y down); uniforms are in uv (y up).
    u.light.value.set(Math.cos(la), Math.sin(la));
    // The shader works in the hex values as written: no colour management.
    u.tint.value.setStyle(v.tint, THREE.LinearSRGBColorSpace);
    u.tintAmt.value = v.tintAmount;
    u.shadow.value = v.shadow;
    u.shadowOff.value.set(v.shadowX, -v.shadowY);
    u.shadowColor.value.setStyle(v.shadowColor, THREE.LinearSRGBColorSpace);
    u.caustics.value = v.caustics;
    this.gl.render(this.scene, this.camera);
  }

  // Edits after the blur radius changes need a fresh height field.
  invalidate() {
    this.dirty = true;
  }

  dispose() {
    this.videos.dispose();
    this.videoTex?.dispose();
    this.maskTex.dispose();
    this.bgTex.dispose();
    this.rtA.dispose();
    this.rtB.dispose();
    this.blur.dispose();
    this.water.dispose();
    this.quad.geometry.dispose();
    this.gl.dispose();
  }
}
