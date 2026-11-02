import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { PROJECTS } from '@/data/projectImages';
import { seededRng } from '@/lab/random';
import { terminalControls } from '../terminal/terminalControls';
import { TerminalWall } from '../terminal/terminalWall';
import { hash } from '../terminal/textFx';
import type { GlassValues } from './glassControls';
import { glassFrag, glassVert } from './glassShaders';

// One tile of terminal content, repeated across the plane. A guillotine layout
// puts window edges exactly on the tile's border, so tiles abut window to
// window and the repeat has no seam to hide.
const TILE_PX = 2048;
const MAX_INSTANCES = 6000;
const WORK_CELL = 512;

const rad = THREE.MathUtils.degToRad;

export class GlassRenderer {
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private content: THREE.CanvasTexture;
  private workCanvas = document.createElement('canvas');
  private work: THREE.CanvasTexture;
  private wall = new TerminalWall();
  private sinceDraw = 1;
  private pan = new THREE.Vector2();
  private time = 0;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private trails: AfterimagePass | null = null;

  private aBox = new THREE.InstancedBufferAttribute(
    new Float32Array(MAX_INSTANCES * 4),
    4,
  );
  private aMeta = new THREE.InstancedBufferAttribute(
    new Float32Array(MAX_INSTANCES * 4),
    4,
  );
  private aUv = new THREE.InstancedBufferAttribute(
    new Float32Array(MAX_INSTANCES * 4),
    4,
  );
  private geometry = new THREE.InstancedBufferGeometry();
  private material: THREE.ShaderMaterial;
  readonly mesh: THREE.Mesh;

  constructor() {
    this.canvas.width = this.canvas.height = TILE_PX;
    this.ctx = this.canvas.getContext('2d')!;
    this.content = new THREE.CanvasTexture(this.canvas);
    this.content.colorSpace = THREE.SRGBColorSpace;
    this.content.minFilter = THREE.LinearMipmapLinearFilter;

    this.workCanvas.width = WORK_CELL * 4;
    this.workCanvas.height = WORK_CELL * 2;
    this.work = new THREE.CanvasTexture(this.workCanvas);
    this.work.colorSpace = THREE.SRGBColorSpace;
    this.loadWork();

    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    this.geometry.index = box.index;
    this.geometry.setAttribute('position', box.getAttribute('position'));
    this.geometry.setAttribute('normal', box.getAttribute('normal'));
    for (const a of [this.aBox, this.aMeta, this.aUv])
      a.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('aBox', this.aBox);
    this.geometry.setAttribute('aMeta', this.aMeta);
    this.geometry.setAttribute('aUv', this.aUv);
    this.geometry.instanceCount = 0;

    this.material = new THREE.ShaderMaterial({
      vertexShader: glassVert,
      fragmentShader: glassFrag,
      uniforms: {
        uContent: { value: this.content },
        uWork: { value: this.work },
        uTime: { value: 0 },
        uLight: { value: new THREE.Vector3() },
        uBg: { value: new THREE.Color() },
        uPan: { value: this.pan },
        uSweepDir: { value: new THREE.Vector2() },
        ...Object.fromEntries(
          [
            'uContentGain',
            'uSide',
            'uEdge',
            'uEdgeW',
            'uSpec',
            'uShine',
            'uFog',
            'uReflAmt',
            'uReflAll',
            'uReflScale',
            'uFresnel',
            'uSweepAmt',
            'uSweepW',
            'uSweepFreq',
            'uSweepSpeed',
            'uSweepGap',
            'uSweepFollow',
            'uSpread',
            'uMeshFreq',
            'uMeshAmt',
            'uFringe',
            'uFringeW',
            'uFringeFreq',
          ].map((k) => [k, { value: 0 }]),
        ),
      },
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
  }

  // Eight pieces of work for the reflective windows, dealt at random.
  private async loadWork() {
    const rng = seededRng(Date.now() & 0xffff);
    const pool = PROJECTS.filter((p) => p.images.length > 0);
    const ctx = this.workCanvas.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.workCanvas.width, this.workCanvas.height);
    await Promise.all(
      Array.from({ length: 8 }, async (_, i) => {
        const p = pool[Math.floor(rng() * pool.length)];
        const load = p.images[Math.floor(rng() * p.images.length)];
        const img = new Image();
        img.src = await load();
        await img.decode().catch(() => undefined);
        const s = Math.max(WORK_CELL / img.width, WORK_CELL / img.height);
        const w = img.width * s;
        const h = img.height * s;
        const x = (i % 4) * WORK_CELL;
        const y = Math.floor(i / 4) * WORK_CELL;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, WORK_CELL, WORK_CELL);
        ctx.clip();
        ctx.drawImage(
          img,
          x + (WORK_CELL - w) / 2,
          y + (WORK_CELL - h) / 2,
          w,
          h,
        );
        ctx.restore();
        this.work.needsUpdate = true;
      }),
    );
  }

  private ensurePost(
    gl: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    if (this.composer) return this.composer;
    const size = gl.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(gl);
    this.composer.addPass(new RenderPass(scene, camera));
    this.trails = new AfterimagePass(0.7);
    this.composer.addPass(this.trails);
    this.bloom = new UnrealBloomPass(size, 0.5, 0.4, 0.6);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    return this.composer;
  }

  resize(gl: THREE.WebGLRenderer, w: number, h: number) {
    if (!this.composer) return;
    this.composer.setPixelRatio(gl.getPixelRatio());
    this.composer.setSize(w, h);
  }

  frame(
    gl: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    delta: number,
    v: GlassValues,
  ) {
    const dt = Math.min(delta, 0.1);
    this.time += dt;
    const tv = terminalControls.values;

    // Redraw the terminal tile, at most `contentFps` times a second.
    this.sinceDraw += dt;
    if (this.sinceDraw >= 1 / v.contentFps) {
      this.wall.render(this.ctx, TILE_PX, TILE_PX, this.sinceDraw * tv.speed, {
        ...tv,
        windows: v.windows,
        fontSize: v.fontSize,
      });
      this.sinceDraw = 0;
      this.content.anisotropy = gl.capabilities.getMaxAnisotropy();
      this.content.needsUpdate = true;
    }

    const a = rad(v.panAngle);
    this.pan.x += Math.cos(a) * v.panSpeed * dt;
    this.pan.y += Math.sin(a) * v.panSpeed * dt;

    this.layoutBlocks(v);
    this.setUniforms(v);

    const pitch = rad(v.pitch);
    const yaw = rad(v.yaw);
    camera.fov = v.fov;
    camera.position.set(
      Math.sin(yaw) * Math.cos(pitch) * v.distance,
      Math.sin(pitch) * v.distance,
      Math.cos(yaw) * Math.cos(pitch) * v.distance,
    );
    camera.lookAt(0, 0, 0);
    camera.far = 400;
    camera.updateProjectionMatrix();
    scene.background = this.material.uniforms.uBg.value;

    const composer = this.ensurePost(gl, scene, camera);
    this.bloom!.strength = v.bloom;
    this.bloom!.radius = v.bloomRadius;
    this.bloom!.threshold = v.bloomThreshold;
    this.trails!.damp = v.trails;
    composer.render(dt);
  }

  // Every drawn window, once per visible tile, as a block on the plane. The
  // pan slides the tiles and wraps them, so the plane never runs out.
  private layoutBlocks(v: GlassValues) {
    const T = v.tileSize;
    const n = v.tiles;
    const offX = ((this.pan.x % T) + T) % T;
    const offZ = ((this.pan.y % T) + T) % T;
    const box = this.aBox.array as Float32Array;
    const meta = this.aMeta.array as Float32Array;
    const uv = this.aUv.array as Float32Array;
    const k = T / TILE_PX;
    let i = 0;
    for (let tx = 0; tx < n; tx++) {
      for (let tz = 0; tz < n; tz++) {
        const ox = (tx - n / 2) * T + offX - T / 2;
        const oz = (tz - n / 2) * T + offZ - T / 2;
        for (const w of this.wall.windows) {
          if (i >= MAX_INSTANCES) break;
          const j = i * 4;
          box[j] = ox + w.x * k;
          box[j + 1] = oz + w.y * k;
          box[j + 2] = w.w * k;
          box[j + 3] = w.h * k;
          const r = hash(w.id, 11);
          const tall = hash(w.id, 12) >= v.flatShare;
          meta[j] = tall
            ? 0.02 + v.depthMax * Math.pow(hash(w.id, 13), v.depthPow)
            : 0.01;
          meta[j + 1] = r;
          meta[j + 2] = hash(w.id, 14) < v.reflShare ? 1 : 0;
          meta[j + 3] = Math.floor(hash(w.id, 15) * 8);
          uv[j] = w.x / TILE_PX;
          uv[j + 1] = 1 - (w.y + w.h) / TILE_PX;
          uv[j + 2] = w.w / TILE_PX;
          uv[j + 3] = w.h / TILE_PX;
          i++;
        }
      }
    }
    this.geometry.instanceCount = i;
    this.aBox.needsUpdate = true;
    this.aMeta.needsUpdate = true;
    this.aUv.needsUpdate = true;
  }

  private setUniforms(v: GlassValues) {
    const u = this.material.uniforms;
    u.uTime.value = this.time;
    const az = rad(v.lightAzimuth);
    const el = rad(v.lightElevation);
    // Azimuth 135 is top left as seen from the default camera.
    u.uLight.value.set(
      -Math.cos(az) * Math.cos(el),
      Math.sin(el),
      -Math.sin(az) * Math.cos(el),
    );
    u.uBg.value.set(v.background);
    const sa = rad(v.sweepAngle);
    u.uSweepDir.value.set(Math.cos(sa), Math.sin(sa));
    const set: Record<string, number> = {
      uContentGain: v.contentGain,
      uSide: v.sideTone,
      uEdge: v.edge,
      uEdgeW: v.edgeWidth,
      uSpec: v.spec,
      uShine: v.shininess,
      uFog: v.fog,
      uReflAmt: v.reflAmt,
      uReflAll: v.reflAll,
      uReflScale: v.reflScale,
      uFresnel: v.fresnel,
      uSweepAmt: v.sweepAmt,
      uSweepW: v.sweepWidth,
      uSweepFreq: v.sweepFreq,
      uSweepSpeed: v.sweepSpeed,
      uSweepGap: v.sweepGap,
      uSweepFollow: v.sweepFollow,
      uSpread: v.spread,
      uMeshFreq: v.meshFreq,
      uMeshAmt: v.meshAmt,
      uFringe: v.fringe,
      uFringeW: v.fringeWidth,
      uFringeFreq: v.fringeFreq,
    };
    for (const key in set) u[key].value = set[key];
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.content.dispose();
    this.work.dispose();
    this.composer?.dispose();
  }
}
