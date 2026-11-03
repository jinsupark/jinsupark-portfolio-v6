// Water sitting on the page. The page copy (`PagePainter`) is uploaded once as
// a texture the size of the document; drops are scattered in document
// coordinates, so they sit on the surface and scroll with it. Per frame only
// the window onto the texture moves; the drop mask is repainted and blurred
// only when the scroll position or the drops change. The surface itself is
// the droplet experiment's: same height field, same water shader.

import * as THREE from 'three';
import {
  blurFrag,
  quadVert,
  waterFrag,
} from '@/experiments/droplet/dropletShaders';
import { seededRng } from '@/lab/random';
import type { HomeValues } from './homeControls';
import type { PagePainter } from './pagePainter';
import { Streams } from './streams';

type P = { x: number; y: number };
// Every drop is a closed outline or a stroked line, in document px relative to
// its anchor; `reach` is how far it extends from there, for culling.
type Drop =
  | { kind: 'fill'; x: number; y: number; reach: number; pts: P[] }
  | {
      kind: 'line';
      x: number;
      y: number;
      reach: number;
      pts: P[];
      width: number;
    };

// A closed lump: a circle pushed out and in by a few random harmonics, then
// stretched and turned. `lumpy` 0 is an ellipse.
function lump(rng: () => number, r: number, lumpy: number): P[] {
  const harmonics = Array.from({ length: 4 }, (_, i) => ({
    k: i + 2,
    a: (rng() * 0.32 * lumpy) / (1 + i * 0.6),
    p: rng() * Math.PI * 2,
  }));
  const stretch = 1 + rng() * 0.45 * (0.4 + lumpy);
  const rot = rng() * Math.PI;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const out: P[] = [];
  for (let i = 0; i < 56; i++) {
    const t = (i / 56) * Math.PI * 2;
    let q = 1;
    for (const h of harmonics) q += h.a * Math.sin(h.k * t + h.p);
    const x = Math.cos(t) * r * q * stretch;
    const y = (Math.sin(t) * r * q) / Math.sqrt(stretch);
    out.push({ x: x * c - y * s, y: x * s + y * c });
  }
  return out;
}

// A trail: a line along a random heading that meanders by two summed waves
// and drifts in curvature, like water run down a pane.
function trail(rng: () => number, length: number, wiggle: number): P[] {
  let heading = rng() * Math.PI * 2;
  const f1 = 0.008 + rng() * 0.01;
  const f2 = 0.02 + rng() * 0.02;
  const p1 = rng() * 6.28;
  const p2 = rng() * 6.28;
  const bend = (rng() - 0.5) * 0.006;
  const step = 6;
  const out: P[] = [{ x: 0, y: 0 }];
  let x = 0;
  let y = 0;
  for (let d = step; d <= length; d += step) {
    heading +=
      bend * step +
      wiggle *
        step *
        (0.035 * Math.sin(d * f1 + p1) + 0.02 * Math.sin(d * f2 + p2));
    x += Math.cos(heading) * step;
    y += Math.sin(heading) * step;
    out.push({ x, y });
  }
  return out;
}

const reachOf = (pts: P[], pad = 0) =>
  pts.reduce((m, p) => Math.max(m, Math.hypot(p.x, p.y)), 0) + pad;

// The mask and height field run at half the CSS resolution; the blur hides it.
const MASK_SCALE = 0.5;

export class PageWater {
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
  private pageTex: THREE.CanvasTexture;
  private drops: Drop[] = [];
  private streams = new Streams();
  private still = matchMedia('(prefers-reduced-motion: reduce)');
  private dropKey = '';
  private maskAt = { x: NaN, y: NaN };
  private dirty = true;
  private W = 1;
  private H = 1;
  private time = 0;
  readonly maxTexture: number;
  private page: PagePainter;

  constructor(canvas: HTMLCanvasElement, page: PagePainter) {
    this.page = page;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.maxTexture = this.gl.capabilities.maxTextureSize;
    this.maskTex = new THREE.CanvasTexture(this.mask);
    this.pageTex = new THREE.CanvasTexture(page.canvas);
    for (const t of [this.maskTex, this.pageTex]) {
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
        tBg: { value: this.pageTex },
        tH: { value: this.rtB.texture },
        res: { value: new THREE.Vector2() },
        texel: { value: new THREE.Vector2() },
        fit: { value: new THREE.Vector2(1, 1) },
        fitOff: { value: new THREE.Vector2() },
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

  // The page copy was repainted: upload it again.
  pageChanged() {
    this.pageTex.dispose();
    this.pageTex.needsUpdate = true;
    this.dropKey = '';
  }

  // Sizes are tuned at desktop width; a phone gets smaller water, not the
  // same puddles covering a third of the screen.
  private sizeScale() {
    return Math.min(1, Math.max(0.5, this.W / 1280));
  }

  // Seeded scatter over the whole document: many small beads, a few puddles.
  private scatter(v: HomeValues) {
    const { w, h } = this.page;
    const key = [
      w,
      h,
      this.W,
      this.H,
      v.drops,
      v.dropSeed,
      v.beadMin,
      v.beadMax,
      v.puddleShare,
      v.puddleMin,
      v.puddleMax,
      v.lumpy,
      v.squiggleShare,
      v.squiggleLength,
      v.squiggleWidth,
      v.wiggle,
      v.spatter,
    ].join('|');
    if (key === this.dropKey) return;
    this.dropKey = key;
    const r = seededRng(v.dropSeed * 911 + 5);
    const n = Math.round(v.drops * ((w * h) / (this.W * this.H)));
    const s = this.sizeScale();
    const between = (a: number, b: number, t: number) =>
      s * (a + (Math.max(a, b) - a) * t);
    // Small beads skew small, as real condensation does; a few are flattened
    // or pulled into short teardrops.
    const bead = (x: number, y: number, size: number): Drop => {
      const pts = lump(r, size, 0.5 + r() * 0.45);
      return { kind: 'fill', x, y, reach: reachOf(pts), pts };
    };
    const drops: Drop[] = [];
    // Placed on the R2 low-discrepancy sequence rather than at random, so
    // the water spreads evenly instead of clumping, with a little jitter so
    // it doesn't read as a lattice.
    const ox = r();
    const oy = r();
    const cell = Math.sqrt((w * h) / Math.max(1, n));
    for (let i = 0; i < n; i++) {
      const x = w * ((ox + i * 0.7548776662) % 1) + (r() - 0.5) * cell * 0.4;
      const y = h * ((oy + i * 0.5698402911) % 1) + (r() - 0.5) * cell * 0.4;
      const roll = r();
      let big = false;
      if (roll < v.squiggleShare) {
        const len = v.squiggleLength * s * (0.45 + r() * 0.9);
        const width = v.squiggleWidth * s * (0.7 + r() * 0.6);
        const pts = trail(r, len, v.wiggle);
        drops.push({
          kind: 'line',
          x,
          y,
          reach: reachOf(pts, width),
          pts,
          width,
        });
        big = true;
      } else if (roll < v.squiggleShare + v.puddleShare) {
        const pts = lump(r, between(v.puddleMin, v.puddleMax, r()), v.lumpy);
        const reach = reachOf(pts);
        drops.push({ kind: 'fill', x, y, reach, pts });
        big = true;
      } else drops.push(bead(x, y, between(v.beadMin, v.beadMax, r() ** 1.8)));

      // Spatter: a few small beads thrown off round the big shapes, so the
      // water clusters the way splashes do instead of sprinkling evenly.
      if (!big) continue;
      const host = drops[drops.length - 1];
      const count = Math.floor(v.spatter * (0.4 + r() * 1.2));
      for (let j = 0; j < count; j++) {
        const a = r() * Math.PI * 2;
        const d = host.reach * (0.9 + r() * 0.9);
        drops.push(
          bead(
            x + Math.cos(a) * d,
            y + Math.sin(a) * d,
            between(v.beadMin * 0.7, v.beadMin * 1.3, r()),
          ),
        );
      }
    }
    this.drops = drops;
    this.dirty = true;
  }

  private paintMask(sx: number, sy: number, v: HomeValues) {
    const g = this.mask.getContext('2d')!;
    const k = MASK_SCALE;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000';
    g.fillRect(0, 0, this.mask.width, this.mask.height);
    g.fillStyle = g.strokeStyle = '#fff';
    g.lineCap = g.lineJoin = 'round';
    for (const d of this.drops) {
      const x = d.x - sx;
      const y = d.y - sy;
      const m = d.reach + 40;
      if (x < -m || y < -m || x > this.W + m || y > this.H + m) continue;
      g.setTransform(k, 0, 0, k, x * k, y * k);
      g.beginPath();
      d.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      if (d.kind === 'fill') {
        g.closePath();
        g.fill();
      } else {
        g.lineWidth = d.width;
        g.stroke();
      }
    }

    // Running water: every trail dot is a disc, all in one path; the blur
    // melts a row of them into a rivulet. Heads are stretched along their
    // way, like a drop being pushed.
    // On the glass: screen px, not moved by the scroll.
    g.setTransform(k, 0, 0, k, 0, 0);
    g.beginPath();
    const life = v.trailLife;
    // A line thinner than this never rises above the waterline after the
    // blur, and would show only as a ghost of shadow; such dots are dropped,
    // so a trail evaporates in pieces rather than as a smear.
    const minR = 0.8 * Math.max(0.5, v.edge * this.sizeScale() * 0.5);
    for (const t of this.streams.trails)
      for (const d of t.dots) {
        const rr = this.streams.radius(d, life);
        if (rr < minR) continue;
        g.moveTo(d.x + rr, d.y);
        g.arc(d.x, d.y, rr, 0, Math.PI * 2);
      }
    g.fill();
    for (const d of this.streams.heads) {
      g.beginPath();
      this.streams
        .outline(d)
        .forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.closePath();
      g.fill();
    }
    this.maskTex.needsUpdate = true;
  }

  frame(W: number, H: number, dpr: number, wallDt: number, v: HomeValues) {
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
    this.scatter(v);
    const s = this.sizeScale();
    const { w, h } = this.page;
    if (this.streams.reset(v, this.W, this.H, s)) this.dirty = true;
    if (this.streams.heads.length && !this.still.matches) {
      this.streams.step(Math.min(wallDt, 0.05), v, this.W, this.H, s);
      this.dirty = true;
    }

    const sx = scrollX;
    const sy = scrollY;
    if (this.dirty || sx !== this.maskAt.x || sy !== this.maskAt.y) {
      this.dirty = false;
      this.maskAt = { x: sx, y: sy };
      this.paintMask(sx, sy, v);
      // The edge scales with the drops, or a shrunken bead never rises
      // above the waterline and leaves only its shadow.
      const radius = Math.max(1, v.edge * this.sizeScale() * MASK_SCALE);
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

    const u = this.water.uniforms;
    // Screen uv (y up) to the document texture (y up, top row = page top).
    u.fit.value.set(W / w, H / h);
    u.fitOff.value.set(sx / w, 1 - (sy + H) / h);
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
    u.light.value.set(Math.cos(la), Math.sin(la));
    // The shader works in the hex values as written: no colour management.
    u.tint.value.setStyle(v.tint, THREE.LinearSRGBColorSpace);
    u.tintAmt.value = v.tintAmount;
    u.shadow.value = v.waterShadow;
    const ss = this.sizeScale();
    u.shadowOff.value.set(v.shadowX * ss, -v.shadowY * ss);
    u.shadowColor.value.setStyle(v.shadowColor, THREE.LinearSRGBColorSpace);
    u.caustics.value = v.caustics;
    this.gl.render(this.scene, this.camera);
  }

  // The blur radius changed: the height field needs redoing.
  invalidate() {
    this.dirty = true;
  }

  dispose() {
    this.maskTex.dispose();
    this.pageTex.dispose();
    this.rtA.dispose();
    this.rtB.dispose();
    this.blur.dispose();
    this.water.dispose();
    this.quad.geometry.dispose();
    this.gl.dispose();
  }
}
