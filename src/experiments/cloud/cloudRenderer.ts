// A cumulus in timelapse. The cloud never moves across the sky; it grows in
// place: lobes rise out of the base, swell, and evaporate as new ones push up
// behind them, while the shader's noise boils the edge. Lobe motion is
// simulated here and handed to the shader as spheres each frame.

import * as THREE from 'three';
import { seededRng } from '@/lab/random';
import type { CloudValues } from './cloudControls';
import { MAX_LOBES, cloudFrag, cloudVert } from './cloudShaders';

type Tower = { x: number; w: number; h: number };
type Lobe = {
  tower: number;
  base: boolean;
  x0: number;
  y0: number;
  target: number;
  r: number;
  drift: number;
  age: number;
  life: number;
  phase: number;
  z: number;
};

const BASE_Y = -0.04;

export class CloudRenderer {
  private gl: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: THREE.ShaderMaterial;
  private quad: THREE.Mesh;
  private lobeU = Array.from({ length: MAX_LOBES }, () => new THREE.Vector4());
  private towers: Tower[] = [];
  private lobes: Lobe[] = [];
  private rng = seededRng(1);
  private key = '';
  private time = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    const c = () => ({ value: new THREE.Color() });
    this.mat = new THREE.ShaderMaterial({
      vertexShader: cloudVert,
      fragmentShader: cloudFrag,
      uniforms: {
        res: { value: new THREE.Vector2() },
        time: { value: 0 },
        lobes: { value: this.lobeU },
        count: { value: 0 },
        skyTop: c(),
        skyBottom: c(),
        cShade: c(),
        cMid: c(),
        cLight: c(),
        cLace: c(),
        light: { value: new THREE.Vector2() },
        merge: { value: 0 },
        roughness: { value: 0 },
        detail: { value: 1 },
        boil: { value: 0 },
        laceAmount: { value: 0 },
        laceWidth: { value: 0 },
        laceScale: { value: 1 },
        edgeLine: { value: 0 },
        brush: { value: 0 },
        grain: { value: 0 },
      },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.scene.add(this.quad);
  }

  private spawn(l: Lobe, v: CloudValues, fresh: boolean) {
    const r = this.rng;
    const T = this.towers[l.tower];
    const gauss = () => (r() + r() + r() - 1.5) * 1.15;
    const f = r() ** 0.75;
    l.target = T.h * (0.15 + 0.85 * f);
    l.x0 = T.x + gauss() * T.w * 0.3 * (1 - 0.35 * f);
    l.y0 = BASE_Y + T.h * 0.05 * r();
    l.r = v.lobeSize * (0.7 + r() * 0.6);
    l.drift = (l.x0 - T.x) * 0.25 + (r() - 0.5) * 0.03;
    l.life = v.life * (0.7 + r() * 0.6);
    l.age = fresh ? r() * l.life : 0;
    l.phase = r() * 6.28;
    l.z = r() * 0.02;
  }

  private build(v: CloudValues, aspect: number) {
    const r = seededRng(v.seed * 389 + 5);
    this.rng = seededRng(v.seed * 17 + 3);
    const n = Math.round(v.towers);
    const span = aspect * 0.8;
    this.towers = [];
    for (let k = 0; k < n; k++)
      this.towers.push({
        x: -span / 2 + ((k + 0.5) / n) * span + (r() - 0.5) * (span / n) * 0.3,
        w: (v.width * aspect) / Math.max(1, n * 0.75),
        h: v.height * (k === Math.floor(n / 2) ? 1 : 0.65 + r() * 0.3),
      });
    this.lobes = [];
    const total = Math.min(MAX_LOBES, Math.round(v.lobes));
    // A few long-lived lobes hold each tower's body; the rest rise and die.
    for (let k = 0; k < n && this.lobes.length < total; k++)
      for (let b = 0; b < 4 && this.lobes.length < total; b++) {
        // A column: two wide at the base, then narrowing up the tower.
        const T = this.towers[k];
        const level = Math.max(0, b - 1);
        this.lobes.push({
          tower: k,
          base: true,
          x0: T.x + (b < 2 ? (b - 0.5) * T.w * 0.4 : (r() - 0.5) * T.w * 0.15),
          y0: BASE_Y + T.h * [0.05, 0.38, 0.62][level] + 0.04 * r(),
          target: 0,
          r: v.lobeSize * [2.2, 1.7, 1.35][level],
          drift: 0,
          age: 0,
          life: 1,
          phase: r() * 6.28,
          z: -0.03,
        });
      }
    for (let i = this.lobes.length; i < total; i++) {
      const l: Lobe = {
        tower: i % n,
        base: false,
        x0: 0,
        y0: 0,
        target: 0,
        r: 0,
        drift: 0,
        age: 0,
        life: 1,
        phase: 0,
        z: 0,
      };
      this.spawn(l, v, true);
      this.lobes.push(l);
    }
  }

  frame(W: number, H: number, dpr: number, wallDt: number, v: CloudValues) {
    const ratio = dpr * v.resolution;
    if (this.gl.getPixelRatio() !== ratio) this.gl.setPixelRatio(ratio);
    const size = this.gl.getSize(new THREE.Vector2());
    if (size.x !== W || size.y !== H) this.gl.setSize(W, H, false);

    const aspect = W / H;
    const key = [
      v.seed,
      v.towers,
      v.lobes,
      v.height,
      v.width,
      v.lobeSize,
      aspect.toFixed(3),
    ].join('|');
    if (key !== this.key) {
      this.key = key;
      this.build(v, aspect);
    }

    const dt = v.paused ? 0 : Math.min(wallDt, 0.1) * v.speed;
    this.time += dt;
    this.lobes.forEach((l, i) => {
      let x: number;
      let y: number;
      let rad: number;
      if (l.base) {
        x = l.x0 + Math.sin(this.time * 0.05 + l.phase) * 0.01;
        y = l.y0;
        rad = l.r * (1 + 0.06 * Math.sin(this.time * 0.15 + l.phase));
      } else {
        l.age += dt;
        if (l.age >= l.life) this.spawn(l, v, false);
        const t = l.age / l.life;
        const rise = 1 - (1 - t) * (1 - t);
        x = l.x0 + l.drift * t;
        y = l.y0 + l.target * rise;
        const grow = 0.35 + 0.65 * smooth(0, 0.4, t);
        rad = l.r * grow * (1 - 0.85 * smooth(0.78, 1, t));
      }
      this.lobeU[i].set(x, y, rad, l.z);
    });

    const u = this.mat.uniforms;
    const la = (v.lightAngle * Math.PI) / 180;
    u.res.value.set(W, H);
    u.time.value = this.time;
    u.count.value = this.lobes.length;
    // The shader works in the hex values as written: no colour management.
    const raw = THREE.LinearSRGBColorSpace;
    u.skyTop.value.setStyle(v.skyTop, raw);
    u.skyBottom.value.setStyle(v.skyBottom, raw);
    u.cShade.value.setStyle(v.shade, raw);
    u.cMid.value.setStyle(v.mid, raw);
    u.cLight.value.setStyle(v.light, raw);
    u.cLace.value.setStyle(v.lace, raw);
    u.light.value.set(Math.cos(la), Math.sin(la));
    u.merge.value = v.merge;
    u.roughness.value = v.roughness;
    u.detail.value = v.detail;
    u.boil.value = v.boil;
    u.laceAmount.value = v.laceAmount;
    u.laceWidth.value = v.laceWidth;
    u.laceScale.value = v.laceScale;
    u.edgeLine.value = v.edgeLine;
    u.brush.value = v.brush;
    u.grain.value = v.grain;
    this.gl.render(this.scene, this.camera);
  }

  dispose() {
    this.mat.dispose();
    this.quad.geometry.dispose();
    this.gl.dispose();
  }
}

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
