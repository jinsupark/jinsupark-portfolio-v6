// The poster wall as one full-screen pass. Composited per pixel rather than as
// one mesh per sheet because the interesting parts all cross layers: a torn edge
// shadows the sheets beneath it, leaves paper behind on them, and stains them
// with the paste that held it down. Each of those needs to know about several
// sheets at once.
//
// Space: p is wall coordinates, 1 unit tall and centred, x scaled by aspect.
// Sheets are indexed bottom (0) to top. Sheet i's tear mask is channel i % 4 of
// mask texture i / 4 (uMask0..3), in screen uv. All poster images share one atlas, because
// GLSL ES can't index an array of samplers with a loop variable.

export const MAX_SHEETS = 16;
// Four sheets per RGBA mask texture.
export const MASK_TEXTURES = MAX_SHEETS / 4;

export const fullscreenVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const noise = /* glsl */ `
  vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }
  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }
  // Nearest-feature distance and that feature's id.
  vec2 worley(vec2 x) {
    vec2 n = floor(x);
    vec2 f = fract(x);
    float d = 8.0;
    float id = 0.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 r = g + hash2(n + g) - f;
        float dd = dot(r, r);
        if (dd < d) {
          d = dd;
          id = hash2(n + g + 31.7).x;
        }
      }
    }
    return vec2(sqrt(d), id);
  }
  mat2 rot(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
  }
`;

// What every pass needs to know about where the sheets are.
const sheets = /* glsl */ `
  #define MAXL ${MAX_SHEETS}
  uniform int uCount;
  uniform vec4 uRect[MAXL]; // centre xy, half size zw, in the sheet's own frame
  uniform vec2 uRot[MAXL];  // cos, sin of the sheet's tilt

  #define NMASK ${MASK_TEXTURES}
  uniform sampler2D uMask0;
  uniform sampler2D uMask1;
  uniform sampler2D uMask2;
  uniform sampler2D uMask3;

  void masksAt(vec2 uv, out vec4 M[NMASK]) {
    M[0] = texture2D(uMask0, uv);
    M[1] = texture2D(uMask1, uv);
    M[2] = texture2D(uMask2, uv);
    M[3] = texture2D(uMask3, uv);
  }
  float channel(int i, vec4 M[NMASK]) {
    return M[i / 4][i - (i / 4) * 4];
  }
  vec2 toSheet(int i, vec2 p) {
    vec2 d = p - uRect[i].xy;
    vec2 cs = uRot[i];
    return vec2(cs.x * d.x + cs.y * d.y, -cs.y * d.x + cs.x * d.y);
  }
  vec2 toSheetDir(int i, vec2 d) {
    vec2 cs = uRot[i];
    return vec2(cs.x * d.x + cs.y * d.y, -cs.y * d.x + cs.x * d.y);
  }
  float sheetDist(int i, vec2 p) {
    vec2 d = abs(toSheet(i, p)) - uRect[i].zw;
    return max(d.x, d.y);
  }
`;

export const paintFrag = /* glsl */ `
  uniform float uAspect;
  uniform vec2 uFrom;
  uniform vec2 uTo;
  uniform float uR0;
  uniform float uR1;
  uniform float uSoft;
  uniform int uOut; // which mask texture this pass writes
  // The wall as it was when the stroke began.
  uniform sampler2D uBase0;
  uniform sampler2D uBase1;
  uniform sampler2D uBase2;
  uniform sampler2D uBase3;
  varying vec2 vUv;

  ${sheets}

  void main() {
    vec4 M[NMASK];
    masksAt(vUv, M);
    vec4 B[NMASK];
    B[0] = texture2D(uBase0, vUv);
    B[1] = texture2D(uBase1, vUv);
    B[2] = texture2D(uBase2, vUv);
    B[3] = texture2D(uBase3, vUv);
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    vec2 pa = p - uFrom;
    vec2 ba = uTo - uFrom;
    float t = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
    float d = length(pa - ba * t);
    float r = mix(uR0, uR1, t);
    // Linear in distance around the edge (0.5 at the edge, 0 one ramp outside
    // it), so anything measured in mask units downstream — edge roughness, the
    // white core — is a distance on the wall, the same everywhere along a tear.
    float ramp = max(r * uSoft, 1e-4);
    float v = clamp(0.5 + (r - d) / (2.0 * ramp), 0.0, 1.0);

    // A stroke tears whichever sheet was on top here when it began, so it
    // carries across posters but only ever takes one layer off. Judging "on
    // top" against the live mask instead would dig through the whole stack in
    // one drag, since each torn sheet hands the top to the one beneath.
    int target = -1;
    for (int j = MAXL - 1; j >= 0; j--) {
      if (j >= uCount) continue;
      if (sheetDist(j, p) <= 0.0 && channel(j, B) < 0.5) {
        target = j;
        break;
      }
    }

    // Sheets above the target are written too. Here they're either torn or
    // don't cover the pixel, so it changes nothing visible — but the mask is
    // filtered, and leaving their texels just outside the outline untorn
    // leaves a hairline of each sheet's edge on the wall.
    vec4 prev = M[uOut];
    for (int c = 0; c < 4; c++) {
      int j = uOut * 4 + c;
      if (j < uCount && j >= target) prev[c] = max(prev[c], v);
    }
    gl_FragColor = prev;
  }
`;

export const copyFrag = /* glsl */ `
  uniform sampler2D uSrc;
  varying vec2 vUv;
  void main() {
    gl_FragColor = texture2D(uSrc, vUv);
  }
`;

export const wallFrag = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uBorder;
  uniform float uAspect;
  uniform float uPixel;

  uniform vec3 uPaperColor;
  uniform float uGrainAmt, uGrainFreq, uFiberAmt, uFiberFreq;
  uniform float uInk, uInkGrain, uSaturation, uFade;
  uniform float uCreaseAmt, uCreaseFreq, uCreaseStretch, uCreaseSharp, uCreaseCover, uCreaseAngle, uCreaseWarp;
  uniform float uBubbleAmt, uBubbleFreq, uBubbleSize, uBubbleDensity;
  uniform float uGlueCover, uGlueGloss, uBrushStreak, uBrushFreq, uBrushAngle, uGlueTintAmt;
  uniform vec3 uGlueTint;

  uniform vec3 uLightDir;
  uniform vec3 uLightColor;
  uniform float uAmbient, uDiffuse, uSpec, uShininess, uNormal;

  uniform float uEdgeRough, uEdgeFreq, uFuzz, uFuzzFreq;
  uniform float uCoreBand, uCoreVary, uCoreVaryFreq, uLift, uLiftWidth;
  uniform vec3 uCoreColor;
  uniform float uResidue, uResidueWidth, uPasteStain, uShadow, uShadowDist;

  uniform vec3 uWallColor;
  uniform float uWallGrain;

  varying vec2 vUv;

  ${noise}
  ${sheets}

  uniform vec4 uCell[MAXL];  // atlas uv offset xy, size zw
  uniform vec4 uCover[MAXL]; // image uv scale xy, offset zw
  uniform sampler2D uVideo;
  uniform float uIsVideo[MAXL];

  float sheetIn(int i, vec2 p) {
    return 1.0 - smoothstep(-uPixel, uPixel, sheetDist(i, p));
  }
  vec2 uvOf(vec2 p) { return p / vec2(uAspect, 1.0) + 0.5; }
  float seedOf(int i) { return float(i) + 1.0; }

  // The painted mask is soft; this is where its 0.5 crossing becomes a torn
  // edge. Large-scale wobble plus fine fibre noise along a seeded grain
  // direction. Gated to the mask's ramp so the noise can't open holes in
  // untouched paper or islands in the middle of a tear.
  float tornField(float raw, vec2 p, float seed) {
    if (raw <= 0.0) return 0.0;
    float gate = smoothstep(0.0, 0.18, raw) * (1.0 - smoothstep(0.82, 1.0, raw));
    float wobble = snoise(p * uEdgeFreq + seed * 3.1) * 0.65
                 + snoise(p * uEdgeFreq * 3.1 - seed * 5.7) * 0.35;
    vec2 fq = rot(seed * 1.9) * p;
    float fibre = snoise(fq * vec2(uFuzzFreq, uFuzzFreq * 0.3));
    return raw + (wobble * uEdgeRough + fibre * uFuzz) * gate;
  }

  // 1 where the sheet is still on the wall. w is the antialiasing width in
  // field units, from fwidth in main, since derivatives in a branch are undefined.
  float present(float field, float w) {
    return 1.0 - smoothstep(0.5 - w, 0.5 + w, field);
  }

  // Strongest shadow cast on point p by any sheet above 'below' (-1 = the wall).
  // Sheets present at p itself are skipped: they cover it rather than shade it.
  float shadowOn(int below, vec2 p, vec2 toLight, float pres[MAXL]) {
    vec2 q = p + toLight;
    vec4 M[NMASK];
    masksAt(uvOf(q), M);
    float s = 0.0;
    for (int j = below + 1; j < MAXL; j++) {
      if (j >= uCount) break;
      float there = sheetIn(j, q) * present(tornField(channel(j, M), q, seedOf(j)), 0.03);
      s = max(s, there * (1.0 - pres[j]));
    }
    return s * uShadow;
  }

  // Each relief term is divided by its own frequency, so its amount reads as a
  // slope: the frequency changes how fine it is, not how hard it catches light.
  float paperHeight(vec2 p, float seed) {
    vec2 q = p + seed * vec2(13.1, 7.7);
    float h = snoise(q * uGrainFreq) * uGrainAmt / uGrainFreq;
    vec2 fq = rot(seed * 2.3) * q;
    h += snoise(fq * vec2(uFiberFreq, uFiberFreq * 0.15)) * uFiberAmt / uFiberFreq;

    // Glue creases: ridges along the noise's zero set, stretched one way and
    // gathered into clusters, since paste wrinkles where it was brushed thick.
    vec2 cq = rot(radians(uCreaseAngle) + seed * 0.7) * q;
    float warp = snoise(q * 1.7 + seed) * uCreaseWarp;
    float n = snoise(vec2(cq.x * uCreaseFreq / uCreaseStretch, cq.y * uCreaseFreq + warp));
    float ridge = pow(1.0 - abs(n), uCreaseSharp);
    float clump = snoise(q * 2.2 - seed) * 0.5 + 0.5;
    float cover = smoothstep(1.0 - uCreaseCover - 0.15, 1.0 - uCreaseCover + 0.15, clump);
    h += ridge * cover * uCreaseAmt / uCreaseFreq;

    // Air trapped under the paste.
    vec2 w = worley(q * uBubbleFreq + seed * 4.0);
    float dome = 1.0 - smoothstep(0.0, uBubbleSize, w.x);
    dome = dome * dome * (3.0 - 2.0 * dome);
    h += dome * step(w.y, uBubbleDensity) * uBubbleAmt / uBubbleFreq;
    return h;
  }

  vec2 paperSlope(vec2 p, float seed) {
    float e = uPixel;
    float h0 = paperHeight(p, seed);
    return vec2(paperHeight(p + vec2(e, 0.0), seed) - h0, paperHeight(p + vec2(0.0, e), seed) - h0) / e;
  }

  // Wheat paste is brushed on over the poster as well as under it, so its sheen
  // follows the brush: broad coverage, broken into strokes along one direction.
  float glue(vec2 p, float seed) {
    vec2 q = p + seed * vec2(5.3, 9.1);
    float cover = smoothstep(1.0 - uGlueCover - 0.2, 1.0 - uGlueCover + 0.2, snoise(q * 1.4) * 0.5 + 0.5);
    vec2 bq = rot(radians(uBrushAngle)) * q;
    float streak = snoise(vec2(bq.x * uBrushFreq * 0.04, bq.y * uBrushFreq)) * 0.5 + 0.5;
    return cover * mix(1.0, streak, uBrushStreak);
  }

  vec3 shade(vec3 albedo, vec2 slope, float gloss) {
    vec3 N = normalize(vec3(-slope * uNormal, 1.0));
    vec3 L = uLightDir;
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float ndl = max(dot(N, L), 0.0);
    float shin = mix(uShininess * 0.2, uShininess, gloss);
    float spec = pow(max(dot(N, H), 0.0), shin) * gloss * uSpec;
    return (albedo * (uAmbient + ndl * uDiffuse) + spec) * uLightColor;
  }

  // Explicit gradients, because this is sampled inside per-sheet branches where
  // implicit derivatives (and so mip selection) are undefined.
  vec3 ink(int i, vec2 p, vec2 dpdx, vec2 dpdy, out float printed) {
    vec2 inner = max(uRect[i].zw - uBorder, vec2(1e-4));
    vec2 iuv = toSheet(i, p) / (2.0 * inner) + 0.5;
    printed = step(0.0, iuv.x) * step(iuv.x, 1.0) * step(0.0, iuv.y) * step(iuv.y, 1.0);
    vec2 scale = uCover[i].xy * uCell[i].zw / (2.0 * inner);
    // Keep clear of the neighbouring cell when the mip filter reaches across.
    vec2 cuv = clamp(iuv * uCover[i].xy + uCover[i].zw, vec2(0.004), vec2(0.996));
    vec3 c;
    // The video is its own texture, so the sheet samples it whole rather than
    // through an atlas cell.
    if (uIsVideo[i] > 0.5) {
      vec2 vs = uCover[i].xy / (2.0 * inner);
      c = textureGrad(uVideo, cuv, toSheetDir(i, dpdx) * vs, toSheetDir(i, dpdy) * vs).rgb;
    } else {
      c = textureGrad(uAtlas, uCell[i].xy + cuv * uCell[i].zw,
                      toSheetDir(i, dpdx) * scale, toSheetDir(i, dpdy) * scale).rgb;
    }
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = max(mix(vec3(l), c, uSaturation), 0.0);
    return mix(c, vec3(1.0), uFade);
  }

  vec3 shadeSheet(int i, vec2 p, float f[MAXL], float pres[MAXL], vec2 lift,
                  vec2 dpdx, vec2 dpdy, vec2 toLight) {
    float seed = seedOf(i);
    float g = glue(p, seed);

    // Paper, ink sitting in the paper's tooth, paste on top.
    float printed;
    vec3 c = ink(i, p, dpdx, dpdy, printed);
    float pit = snoise(p * uGrainFreq * 0.7 + seed * 11.0) * 0.5 + 0.5;
    float density = uInk * (1.0 - pit * uInkGrain) * printed;
    vec3 alb = uPaperColor * mix(vec3(1.0), c, density);
    alb *= mix(vec3(1.0), uGlueTint, g * uGlueTintAmt);

    // The tear splits the paper, so the edge that stays behind shows its
    // unprinted core. Its width swells and pinches along the tear, down to
    // nothing in places, because paper splits through its thickness unevenly.
    // Capped below 0.5, where it would reach untorn paper.
    float vary = snoise(p * uCoreVaryFreq + 9.0 + seed) * 0.7 + snoise(p * uCoreVaryFreq * 2.3 - 3.0) * 0.3;
    float band = clamp(uCoreBand * (1.0 + vary * uCoreVary * 1.4), 0.0, 0.48);
    float near = smoothstep(0.5 - max(band, 1e-4), 0.5, f[i]);
    float fib = snoise(rot(1.9 + seed) * p * vec2(uFuzzFreq * 0.5, uFuzzFreq * 0.12)) * 0.5 + 0.5;
    // Solid through its width; the fibres only rag the inner edge, where the
    // print begins. The outer edge already carries the tear's own fuzz.
    // Multiplicative, so paper nowhere near a tear (near = 0) can't fleck.
    float core = smoothstep(0.04, 0.16, near * (1.0 + (fib - 0.5) * 0.8)) * step(1e-3, band);
    alb = mix(alb, uCoreColor * (0.9 + 0.1 * fib), core);
    g *= 1.0 - core;

    // What came away from on top of this sheet left its paste behind, darker
    // and wetter, and near its edge, scraps of its own back paper carrying a
    // ghost of the print that came through.
    float stained = 0.0;
    float scraps = 0.0;
    vec3 scrap = vec3(0.0);
    for (int j = i + 1; j < MAXL; j++) {
      if (j >= uCount) break;
      float torn = sheetIn(j, p) * (1.0 - pres[j]);
      if (torn <= 0.0) continue;
      stained = max(stained, torn);
      float r = (f[j] - 0.5) / uResidueWidth;
      float blot = snoise(p * 38.0 + 4.0 + seedOf(j)) * 0.5 + 0.5 + snoise(p * 140.0) * 0.175;
      float s = torn * (1.0 - smoothstep(0.0, 1.0, r)) * smoothstep(0.55, 0.7, blot) * uResidue;
      if (s > scraps) {
        scraps = s;
        float pj;
        vec3 ghost = ink(j, p, dpdx, dpdy, pj);
        scrap = uPaperColor * mix(vec3(1.0), ghost, 0.22 * pj) * 0.94;
      }
    }
    stained *= uPasteStain;
    alb *= mix(vec3(1.0), uGlueTint * 0.8, stained);
    g = max(g, stained);
    alb = mix(alb, scrap, scraps);

    // Freed from the paste, a torn edge lifts off the wall and catches the light.
    vec2 slope = paperSlope(p, seed) + lift;
    return shade(alb, slope, g * uGlueGloss) * (1.0 - shadowOn(i, p, toLight, pres));
  }

  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    vec2 dpdx = dFdx(p);
    vec2 dpdy = dFdy(p);
    vec4 M[NMASK];
    masksAt(vUv, M);
    vec2 toLight = uLightDir.xy / max(uLightDir.z, 0.15) * uShadowDist;

    // Per-sheet fields first, in uniform control flow, so fwidth and dFdx are
    // defined for every sheet before anything branches on which one is visible.
    float f[MAXL];
    float pres[MAXL];
    vec2 lift[MAXL];
    for (int i = 0; i < MAXL; i++) {
      f[i] = 0.0;
      pres[i] = 0.0;
      lift[i] = vec2(0.0);
      if (i >= uCount) continue;
      float fi = tornField(channel(i, M), p, seedOf(i));
      f[i] = fi;
      pres[i] = sheetIn(i, p) * present(fi, max(fwidth(fi) * 0.75, 1e-4));
      float lh = smoothstep(0.5 - uLiftWidth, 0.5, fi) * uLift * 0.004;
      lift[i] = vec2(dFdx(lh), dFdy(lh)) / uPixel;
    }

    // Front to back: each sheet takes what the ones above it left uncovered.
    vec3 col = vec3(0.0);
    float remain = 1.0;
    for (int k = MAXL - 1; k >= 0; k--) {
      if (k >= uCount || pres[k] <= 0.0) continue;
      if (remain < 1e-3) break;
      col += shadeSheet(k, p, f, pres, lift[k], dpdx, dpdy, toLight) * pres[k] * remain;
      remain *= 1.0 - pres[k];
    }

    if (remain > 1e-3) {
      float n = snoise(p * 9.0) * 0.5 + 0.5;
      vec3 alb = uWallColor * (0.82 + 0.18 * n);
      float stained = 0.0;
      for (int j = 0; j < MAXL; j++) {
        if (j >= uCount) break;
        stained = max(stained, sheetIn(j, p) * (1.0 - pres[j]));
      }
      stained *= uPasteStain;
      alb *= mix(vec3(1.0), uGlueTint * 0.7, stained * 0.6);
      vec2 slope = vec2(snoise(p * 700.0), snoise(p * 700.0 + 17.0)) * uWallGrain * 0.5;
      col += shade(alb, slope, stained * 0.6) * (1.0 - shadowOn(-1, p, toLight, pres)) * remain;
    }

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;
