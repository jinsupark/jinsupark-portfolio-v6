import * as THREE from 'three';
import { PROJECTS, type ImageLoader } from '@/data/projectImages';
import { DemoVideos } from '@/lab/demoVideo';
import { seededRng } from '@/lab/random';
import { FORMATS, type PosterValues } from './posterControls';
import {
  MASK_TEXTURES,
  MAX_SHEETS,
  copyFrag,
  fullscreenVert,
  paintFrag,
  wallFrag,
} from './shaders';

// Mask resolution is fixed rather than following the canvas, so a resize
// stretches the tears instead of erasing them. Eight of these exist (four
// textures, ping-ponged), which is what keeps it from being larger.
const MASK_W = 1536;
const MASK_H = 960;

// Every sheet's image lives in one cell of this atlas, stretched to fill it; the
// shader undoes the stretch with the image's real aspect. 768 covers a sheet
// that's a third of the screen tall at 2x.
const CELL = 768;
const COLS = 4;
const ATLAS_W = CELL * COLS;
const ATLAS_H = CELL * Math.ceil(MAX_SHEETS / COLS);

type InputEvent =
  | { type: 'down'; at: THREE.Vector2 }
  | { type: 'move'; at: THREE.Vector2 }
  | { type: 'up' };

// Written by the page's DOM handlers, drained by the renderer once per frame.
export class PosterInput {
  queue: InputEvent[] = [];
  clear = true;
  push(e: InputEvent) {
    this.queue.push(e);
  }
  requestClear() {
    this.clear = true;
  }
}

// Every numeric control the wall shader reads, uploaded as `u<Name>`.
const SCALARS = [
  'grainAmt',
  'grainFreq',
  'fiberAmt',
  'fiberFreq',
  'ink',
  'inkGrain',
  'saturation',
  'fade',
  'creaseAmt',
  'creaseFreq',
  'creaseStretch',
  'creaseSharp',
  'creaseCover',
  'creaseAngle',
  'creaseWarp',
  'bubbleAmt',
  'bubbleFreq',
  'bubbleSize',
  'bubbleDensity',
  'glueCover',
  'glueGloss',
  'brushStreak',
  'brushFreq',
  'brushAngle',
  'glueTintAmt',
  'ambient',
  'diffuse',
  'spec',
  'shininess',
  'normal',
  'edgeRough',
  'edgeFreq',
  'fuzz',
  'fuzzFreq',
  'coreBand',
  'coreVary',
  'coreVaryFreq',
  'lift',
  'liftWidth',
  'residue',
  'residueWidth',
  'pasteStain',
  'shadow',
  'shadowDist',
  'wallGrain',
] as const satisfies readonly (keyof PosterValues)[];

const uniformName = (k: string) => `u${k[0].toUpperCase()}${k.slice(1)}`;

// A dealt sheet. Geometry is kept as unit randoms and resolved against the
// sliders every frame, so resizing or spreading the wall doesn't reshuffle it.
type Sheet = {
  key: string;
  load: ImageLoader;
  cell: number; // grid slot, shuffled so stacking order isn't reading order
  rx: number;
  ry: number;
  rs: number;
  ra: number;
  vid: number; // printed with the video when below `videoShare`
};

function shuffle<T>(arr: T[], rng: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function deal(seed: number, count: number): Sheet[] {
  const rng = seededRng(seed);
  const pool = shuffle(
    PROJECTS.filter((p) => p.images.length > 0),
    rng,
  );
  const cells = shuffle(
    Array.from({ length: count }, (_, i) => i),
    rng,
  );
  // Its own stream, so adding it didn't reshuffle every existing wall.
  const vrng = seededRng(seed * 31 + 5);
  return Array.from({ length: count }, (_, i) => {
    const p = pool[i % pool.length];
    const shot = Math.floor(rng() * p.images.length);
    return {
      key: `${p.year}/${p.id}/${shot}`,
      load: p.images[shot],
      cell: cells[i],
      rx: rng() - 0.5,
      ry: rng() - 0.5,
      rs: rng() * 2 - 1,
      ra: rng() * 2 - 1,
      vid: vrng(),
    };
  });
}

class Atlas {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  private cells: { key: string; aspect: number }[] = [];

  constructor() {
    this.canvas.width = ATLAS_W;
    this.canvas.height = ATLAS_H;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.fillStyle = '#fff';
    this.ctx.fillRect(0, 0, ATLAS_W, ATLAS_H);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
  }

  private origin(i: number) {
    return [(i % COLS) * CELL, Math.floor(i / COLS) * CELL] as const;
  }

  set(i: number, key: string, load: ImageLoader) {
    if (this.cells[i]?.key === key) return;
    this.cells[i] = { key, aspect: 1 };
    const [x, y] = this.origin(i);
    this.ctx.fillStyle = '#fff';
    this.ctx.fillRect(x, y, CELL, CELL);
    this.texture.needsUpdate = true;
    load().then(async (url) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      if (this.cells[i]?.key !== key) return;
      this.ctx.drawImage(img, x, y, CELL, CELL);
      this.cells[i].aspect = img.naturalWidth / img.naturalHeight;
      this.texture.needsUpdate = true;
    });
  }

  aspect(i: number) {
    return this.cells[i]?.aspect ?? 1;
  }

  // uv offset + size of cell i. The texture is flipped on upload, so canvas row
  // 0 is the top of uv space.
  uv(i: number, out: THREE.Vector4) {
    const [x, y] = this.origin(i);
    out.set(
      x / ATLAS_W,
      1 - (y + CELL) / ATLAS_H,
      CELL / ATLAS_W,
      CELL / ATLAS_H,
    );
  }

  dispose() {
    this.texture.dispose();
  }
}

// uv scale + offset that crops the image to cover the printable area.
function coverOf(
  halfW: number,
  halfH: number,
  border: number,
  imgAspect: number,
  out: THREE.Vector4,
) {
  const area = Math.max(halfW - border, 1e-4) / Math.max(halfH - border, 1e-4);
  if (imgAspect > area) {
    const s = area / imgAspect;
    out.set(s, 1, (1 - s) / 2, 0);
  } else {
    const s = imgAspect / area;
    out.set(1, s, 0, (1 - s) / 2);
  }
}

function fullscreen(material: THREE.ShaderMaterial) {
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);
  return scene;
}

const makeTarget = () =>
  new THREE.WebGLRenderTarget(MASK_W, MASK_H, {
    depthBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });

const vec4s = () =>
  Array.from({ length: MAX_SHEETS }, () => new THREE.Vector4());
const vec2s = () =>
  Array.from({ length: MAX_SHEETS }, () => new THREE.Vector2(1, 0));

const maskUniforms = () =>
  Object.fromEntries(
    Array.from({ length: MASK_TEXTURES }, (_, k) => [
      `uMask${k}`,
      { value: null },
    ]),
  );

export class PosterRenderer {
  // One ping-ponged pair per mask texture; sheet i lives in pair i / 4.
  private masks = Array.from({ length: MASK_TEXTURES }, () => [
    makeTarget(),
    makeTarget(),
  ]);
  private front = this.masks.map(() => 0);
  private atlas = new Atlas();
  private videos = new DemoVideos();
  private video = this.videos.get(0);
  private videoTex = (() => {
    const t = new THREE.VideoTexture(this.video);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  private sheets: Sheet[] = [];
  private dealt = '';
  private camera = new THREE.Camera();
  private size = new THREE.Vector2();
  // The masks as they stood when the current stroke began; see paintFrag.
  private base = Array.from({ length: MASK_TEXTURES }, makeTarget);
  private copy = new THREE.ShaderMaterial({
    vertexShader: fullscreenVert,
    fragmentShader: copyFrag,
    depthTest: false,
    depthWrite: false,
    uniforms: { uSrc: { value: null } },
  });
  private copyScene = fullscreen(this.copy);
  private clearColor = new THREE.Color();
  private stroke = {
    active: false,
    last: new THREE.Vector2(),
    len: 0,
    phase: 0,
  };
  private rects = vec4s();
  private rots = vec2s();

  private paint = new THREE.ShaderMaterial({
    vertexShader: fullscreenVert,
    fragmentShader: paintFrag,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      ...maskUniforms(),
      uAspect: { value: 1 },
      uFrom: { value: new THREE.Vector2() },
      uTo: { value: new THREE.Vector2() },
      uR0: { value: 0.05 },
      uR1: { value: 0.05 },
      uSoft: { value: 0.7 },
      uOut: { value: 0 },
      ...Object.fromEntries(
        this.base.map((t, k) => [`uBase${k}`, { value: t.texture }]),
      ),
      uCount: { value: 0 },
      uRect: { value: this.rects },
      uRot: { value: this.rots },
    },
  });
  private paintScene = fullscreen(this.paint);

  readonly wall = new THREE.ShaderMaterial({
    vertexShader: fullscreenVert,
    fragmentShader: wallFrag,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      ...maskUniforms(),
      uAtlas: { value: this.atlas.texture },
      uCount: { value: 0 },
      uRect: { value: this.rects },
      uRot: { value: this.rots },
      uCell: { value: vec4s() },
      uCover: { value: vec4s() },
      uVideo: { value: this.videoTex },
      uIsVideo: { value: new Array<number>(MAX_SHEETS).fill(0) },
      uBorder: { value: 0 },
      uAspect: { value: 1 },
      uPixel: { value: 0.001 },
      uPaperColor: { value: new THREE.Color() },
      uGlueTint: { value: new THREE.Color() },
      uLightColor: { value: new THREE.Color() },
      uCoreColor: { value: new THREE.Color() },
      uWallColor: { value: new THREE.Color() },
      uLightDir: { value: new THREE.Vector3() },
      ...Object.fromEntries(SCALARS.map((k) => [uniformName(k), { value: 0 }])),
    },
  });

  private bindMasks(u: Record<string, THREE.IUniform>) {
    this.masks.forEach(
      (pair, k) => (u[`uMask${k}`].value = pair[this.front[k]].texture),
    );
  }

  frame(gl: THREE.WebGLRenderer, v: PosterValues, input: PosterInput) {
    gl.getDrawingBufferSize(this.size);
    const aspect = this.size.x / this.size.y;

    // A new deal is a new wall, so its tears go with the old one.
    const dealKey = `${v.seed}:${v.sheets}`;
    if (dealKey !== this.dealt) {
      this.dealt = dealKey;
      this.sheets = deal(v.seed, v.sheets);
      this.sheets.forEach((s, i) => this.atlas.set(i, s.key, s.load));
      input.clear = true;
    }
    this.layout(v, aspect);

    if (input.clear) {
      const alpha = gl.getClearAlpha();
      gl.getClearColor(this.clearColor);
      gl.setClearColor(0x000000, 0);
      for (const t of this.masks.flat()) {
        gl.setRenderTarget(t);
        gl.clear();
      }
      gl.setClearColor(this.clearColor, alpha);
      input.clear = false;
    }

    for (const e of input.queue) this.handle(gl, e, v, aspect);
    input.queue.length = 0;
    gl.setRenderTarget(null);

    const u = this.wall.uniforms;
    this.bindMasks(u);
    u.uCount.value = this.sheets.length;
    u.uBorder.value = v.border;
    u.uAspect.value = aspect;
    u.uPixel.value = 1 / this.size.y;
    u.uPaperColor.value.set(v.paperColor);
    u.uGlueTint.value.set(v.glueTint);
    u.uLightColor.value.set(v.lightColor);
    u.uCoreColor.value.set(v.coreColor);
    u.uWallColor.value.set(v.wallColor);
    const az = THREE.MathUtils.degToRad(v.azimuth);
    const el = THREE.MathUtils.degToRad(v.elevation);
    u.uLightDir.value.set(
      Math.cos(el) * Math.cos(az),
      Math.cos(el) * Math.sin(az),
      Math.sin(el),
    );
    for (const k of SCALARS) u[uniformName(k)].value = v[k];
  }

  // A grid fitted to the screen's shape, one sheet per cell. The last row
  // spreads its sheets across the full width rather than leaving a gap. Each
  // sheet is sized to cover its cell at scale 1, whatever its aspect.
  private layout(v: PosterValues, aspect: number) {
    const fmt = FORMATS[v.format];
    const u = this.wall.uniforms;
    const n = this.sheets.length;
    const vidReady = DemoVideos.ready(this.video);
    const cols = Math.max(1, Math.round(Math.sqrt(n * aspect)));
    const rows = Math.ceil(n / cols);
    const W = aspect * v.spread;
    const H = v.spread;
    const ch = H / rows;
    this.sheets.forEach((s, i) => {
      const row = Math.floor(s.cell / cols);
      const inRow = row === rows - 1 ? n - cols * (rows - 1) : cols;
      const cw = W / inRow;
      const col = s.cell - row * cols;
      const isVideo = vidReady && s.vid < v.videoShare;
      u.uIsVideo.value[i] = isVideo ? 1 : 0;
      const imgAspect = isVideo
        ? this.video.videoWidth / this.video.videoHeight
        : this.atlas.aspect(i);
      const sheetAspect = fmt ?? imgAspect;
      const cover = Math.max(ch, cw / sheetAspect);
      const h = (cover * v.scale * Math.max(0.2, 1 + s.rs * v.sizeJitter)) / 2;
      const w = h * sheetAspect;
      this.rects[i].set(
        -W / 2 + (col + 0.5 + s.rx * v.jitter) * cw,
        H / 2 - (row + 0.5 + s.ry * v.jitter) * ch,
        w,
        h,
      );
      const a = THREE.MathUtils.degToRad(s.ra * v.tilt);
      this.rots[i].set(Math.cos(a), Math.sin(a));
      this.atlas.uv(i, u.uCell.value[i]);
      coverOf(w, h, v.border, imgAspect, u.uCover.value[i]);
    });
  }

  private handle(
    gl: THREE.WebGLRenderer,
    e: InputEvent,
    v: PosterValues,
    aspect: number,
  ) {
    const s = this.stroke;
    if (e.type === 'down') {
      this.masks.forEach((pair, k) => {
        this.copy.uniforms.uSrc.value = pair[this.front[k]].texture;
        gl.setRenderTarget(this.base[k]);
        gl.render(this.copyScene, this.camera);
      });
      s.active = true;
      s.last.copy(e.at);
      s.len = 0;
      s.phase = Math.random() * 100;
    } else if (e.type === 'move') {
      if (!s.active) return;
      const r0 = this.radiusAt(v, s.len);
      s.len += s.last.distanceTo(e.at);
      this.segment(gl, v, aspect, s.last, e.at, r0, this.radiusAt(v, s.len));
      s.last.copy(e.at);
    } else {
      s.active = false;
    }
  }

  // Width wanders along the stroke, so a rip doesn't read as a brush.
  private radiusAt(v: PosterValues, len: number) {
    const ph = this.stroke.phase;
    const n =
      Math.sin(len * 23 + ph) * 0.6 + Math.sin(len * 61 + ph * 2.3) * 0.4;
    return v.ripWidth * Math.max(0.15, 1 + v.ripJitter * n);
  }

  private segment(
    gl: THREE.WebGLRenderer,
    v: PosterValues,
    aspect: number,
    from: THREE.Vector2,
    to: THREE.Vector2,
    r0: number,
    r1: number,
  ) {
    const u = this.paint.uniforms;
    this.bindMasks(u);
    u.uAspect.value = aspect;
    u.uFrom.value.copy(from);
    u.uTo.value.copy(to);
    u.uR0.value = r0;
    u.uR1.value = r1;
    u.uSoft.value = v.ripSoft;
    u.uCount.value = this.sheets.length;
    // The torn sheet varies along the stroke, so every mask texture holding a
    // dealt sheet gets a pass. Fronts swap only after all of them, so each
    // pass reads the same state.
    const used = Math.ceil(this.sheets.length / 4);
    for (let k = 0; k < used; k++) {
      u.uOut.value = k;
      gl.setRenderTarget(this.masks[k][1 - this.front[k]]);
      gl.render(this.paintScene, this.camera);
    }
    for (let k = 0; k < used; k++) this.front[k] = 1 - this.front[k];
  }

  dispose() {
    this.masks.flat().forEach((t) => t.dispose());
    this.base.forEach((t) => t.dispose());
    this.copy.dispose();
    this.atlas.dispose();
    this.videoTex.dispose();
    this.videos.dispose();
    this.paint.dispose();
    this.wall.dispose();
  }
}
