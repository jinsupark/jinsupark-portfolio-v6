// Every pass is a full-screen triangle pair over the artwork. Colour stays in
// the textures' own (sRGB) values throughout, so blend modes behave the way
// they do in a design tool rather than in linear light.

export const VERT = /* glsl */ `
in vec3 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

export const FILL_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
out vec4 outColor;
void main() { outColor = vec4(uColor, 1.0); }`;

// Helpers shared by the layer and fill passes.
const COMMON = /* glsl */ `
// Artwork position (design units, y down) into a frame's 0..1 space.
vec2 toLocal(vec2 p, vec4 f, float r) {
  vec2 d = p - (f.xy + f.zw * 0.5);
  float s = sin(-r), c = cos(-r);
  d = vec2(d.x * c - d.y * s, d.x * s + d.y * c);
  return (d + f.zw * 0.5) / f.zw;
}
// 1 inside the frame, with a one-pixel soft edge so a rotated frame isn't jagged.
float inside(vec2 l) {
  vec2 w = fwidth(l);
  vec2 a = smoothstep(-w * 0.5, w * 0.5, l) * smoothstep(-w * 0.5, w * 0.5, 1.0 - l);
  return a.x * a.y;
}
// Canvas and render-target textures both have v pointing up.
vec4 sampleIn(sampler2D t, vec2 l) { return texture(t, vec2(l.x, 1.0 - l.y)); }

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

float bayer4(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i.y * 4 + i.x]) + 0.5) / 16.0;
}

vec3 blend(vec3 b, vec3 s, int mode) {
  if (mode == 1) return b * s;
  if (mode == 2) return 1.0 - (1.0 - b) * (1.0 - s);
  if (mode == 3) return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, b));
  if (mode == 4) return min(b, s);
  if (mode == 5) return max(b, s);
  if (mode == 6) return abs(b - s);
  if (mode == 7) return b + s - 2.0 * b * s;
  if (mode == 8) return mix(min(vec3(1.0), b / max(1.0 - s, 1e-4)), vec3(0.0), step(b, vec3(0.0)));
  if (mode == 9) return mix(1.0 - min(vec3(1.0), (1.0 - b) / max(s, 1e-4)), vec3(1.0), step(vec3(1.0), b));
  if (mode == 10) return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, s));
  if (mode == 11) {
    vec3 d = mix(((16.0 * b - 12.0) * b + 4.0) * b, sqrt(b), step(0.25, b));
    return mix(b - (1.0 - 2.0 * s) * b * (1.0 - b), b + (2.0 * s - 1.0) * (d - b), step(0.5, s));
  }
  if (mode == 12) return min(vec3(1.0), b + s);
  return s;
}

float h21(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}
float vnoise(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x),
             mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.07 + vec2(13.1, 7.7);
    a *= 0.5;
  }
  return s;
}

// \`s\` (straight alpha \`a\`) laid over \`b\`, blended by \`mode\` only where
// there's something below. Over an opaque base this is the plain blend.
vec4 over(vec4 b, vec3 s, float a, int mode) {
  vec3 sc = mix(s, clamp(blend(b.rgb, s, mode), 0.0, 1.0), b.a);
  float oa = a + b.a * (1.0 - a);
  vec3 oc = oa > 0.0 ? (sc * a + b.rgb * b.a * (1.0 - a)) / oa : vec3(0.0);
  return vec4(oc, oa);
}

// Back from a frame's 0..1 space to artwork position.
vec2 fromLocal(vec2 l, vec4 f, float r) {
  vec2 d = l * f.zw - f.zw * 0.5;
  float s = sin(r), c = cos(r);
  return vec2(d.x * c - d.y * s, d.x * s + d.y * c) + f.xy + f.zw * 0.5;
}
// The artwork position under a pass's pixel: passes render the visible part
// of the artwork, \`view\` (x, y, w, h in design units).
vec2 artAt(vec2 uv, vec4 view) {
  return view.xy + vec2(uv.x, 1.0 - uv.y) * view.zw;
}
// A view-sized render target read at artwork position p.
vec4 atArt(sampler2D t, vec2 p, vec4 view) {
  vec2 q = (p - view.xy) / view.zw;
  return texture(t, vec2(q.x, 1.0 - q.y));
}
`;

// A shape's signed distance field: design units to the outline, negative
// inside (nonzero winding, so a lasso that crosses itself stays filled). The
// outline arrives as a polygon in a one-row float texture; the field covers
// the frame plus a pad, so effects that reach outside the shape have a field
// to read. Run only when the outline changes.
export const SDF_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uPts;
uniform int uCount;
uniform vec4 uDomain;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec2 q = uDomain.xy + vec2(vUv.x, 1.0 - vUv.y) * uDomain.zw;
  float d = 1e12;
  int wn = 0;
  vec2 a = texelFetch(uPts, ivec2(uCount - 1, 0), 0).xy;
  for (int i = 0; i < 4096; i++) {
    if (i >= uCount) break;
    vec2 b = texelFetch(uPts, ivec2(i, 0), 0).xy;
    vec2 e = b - a;
    vec2 w = q - a;
    float t = clamp(dot(w, e) / max(dot(e, e), 1e-9), 0.0, 1.0);
    vec2 r = w - e * t;
    d = min(d, dot(r, r));
    float c = e.x * w.y - e.y * w.x;
    if (a.y <= q.y) { if (b.y > q.y && c > 0.0) wn++; }
    else if (b.y <= q.y && c < 0.0) wn--;
    a = b;
  }
  outColor = vec4((wn != 0 ? -1.0 : 1.0) * sqrt(d), 0.0, 0.0, 1.0);
}`;

// A layer's whole outline as a distance at every artwork pixel: its shape (a
// field texture, or the frame's own rectangle worked out exactly), folded
// with up to three other shapes, torn by noise anchored to the layer. Every
// later pass that needs the edge (cut, strokes, shadows) reads this one
// buffer instead of working the shape out again.
export const DIST_FRAG = /* glsl */ `
precision highp float;
uniform vec2 uDesign;
uniform vec4 uView;
uniform vec4 uFrame;
uniform float uRot;
uniform sampler2D uShape;
uniform int uShapeMode;
uniform float uPad;
uniform sampler2D uOp0;
uniform sampler2D uOp1;
uniform sampler2D uOp2;
uniform ivec3 uOpKind;
uniform ivec3 uOpMode;
uniform vec4 uOpFrame0;
uniform vec4 uOpFrame1;
uniform vec4 uOpFrame2;
uniform vec3 uOpRot;
uniform vec3 uOpPad;
uniform float uSmooth;
// Tears, each amount, frequency, seed; they add up.
uniform int uTears;
uniform vec4 uTear[4];
in vec2 vUv;
out vec4 outColor;
${COMMON}
float smin(float a, float b, float k) {
  if (k <= 0.0) return min(a, b);
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float smax(float a, float b, float k) { return -smin(-a, -b, k); }

// Distance to a shape at artwork point p: an exact rectangle for a plain
// frame, otherwise its field, laid over the frame plus pad.
float sdfOf(sampler2D t, int mode, vec2 p, vec4 f, float r, float pad) {
  vec2 q = toLocal(p, f, r) * f.zw;
  if (mode == 0) {
    vec2 d = abs(q - f.zw * 0.5) - f.zw * 0.5;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }
  vec2 uv = (q + pad) / (f.zw + 2.0 * pad);
  float inDomain = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  float d = sampleIn(t, clamp(uv, 0.0, 1.0)).r;
  // Beyond the field it can only be further out.
  return inDomain > 0.5 ? d : max(d, pad);
}

float combine(float d, float e, int kind) {
  if (kind == 1) return smin(d, e, uSmooth);
  if (kind == 2) return smax(d, e, uSmooth);
  if (kind == 3) return smax(d, -e, uSmooth);
  if (kind == 4) return max(smin(d, e, uSmooth), -smax(d, e, uSmooth));
  return d;
}

void main() {
  vec2 p = artAt(vUv, uView);
  float d = sdfOf(uShape, uShapeMode, p, uFrame, uRot, uPad);
  if (uOpKind.x > 0) d = combine(d, sdfOf(uOp0, uOpMode.x, p, uOpFrame0, uOpRot.x, uOpPad.x), uOpKind.x);
  if (uOpKind.y > 0) d = combine(d, sdfOf(uOp1, uOpMode.y, p, uOpFrame1, uOpRot.y, uOpPad.y), uOpKind.y);
  if (uOpKind.z > 0) d = combine(d, sdfOf(uOp2, uOpMode.z, p, uOpFrame2, uOpRot.z, uOpPad.z), uOpKind.z);
  // Anchored to the layer, so a torn edge travels with it.
  vec2 q = toLocal(p, uFrame, uRot) * uFrame.zw;
  for (int i = 0; i < 4; i++) {
    if (i >= uTears) break;
    vec4 t = uTear[i];
    d += (fbm(q * t.y + t.z * 7.13) - 0.5) * 2.4 * t.x;
  }
  outColor = vec4(d, 0.0, 0.0, 1.0);
}`;

// One step of building a layer, in artwork space, onto what it has so far
// (uPrev). Steps, by uOp:
//  0  a fill: its texture, sampled in its own space, laid over.
//  1–6 a filter (pixelate, mono, invert, posterize, threshold, dither) on the
//     layer so far, replacing it, or on the artwork behind (uInput 1), laid
//     over it.
//  7  an artwork-space texture (a blur's result), replacing or laid over, as
//     a filter.
//  8  the cut: the layer so far, kept to its shape (and feathered).
//  9  a stroke: its paint (uSrc, artwork space) in a band along the edge,
//     laid over with its own opacity and blend.
export const STACK_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uPrev;
uniform sampler2D uBase;
uniform sampler2D uSrc;
uniform sampler2D uDist;
uniform vec2 uDesign;
uniform vec4 uView;
uniform vec4 uFrame;
uniform float uRot;
uniform float uPad;
// Where a fill's texture lies: 0 the frame, 1 the whole artwork, 2 the frame
// plus pad (a shape style, kept to that box).
uniform int uSrcSpace;
uniform int uOp;
uniform int uInput;
// The box pixelate's cells are laid across, and the cells in it.
uniform vec4 uGrid;
uniform float uGridRot;
uniform vec2 uCells;
uniform float uAmount;
uniform vec3 uInk;
uniform vec3 uPaper;
uniform float uFeather;
uniform float uWidth;
uniform int uAlign;
uniform float uOffset;
uniform float uFibers;
// A border's sides: 0 all, 1 top, 2 bottom, 3 left, 4 right.
uniform int uSide;
// Grain: pixels per cell, and the clock it shimmers on.
uniform float uGrainPx;
uniform float uTime;
uniform float uTearScale;
uniform float uSeed;
uniform float uOpacity;
uniform int uBlend;
in vec2 vUv;
out vec4 outColor;
${COMMON}
vec4 readInput(vec2 q) {
  return uInput == 1 ? vec4(atArt(uBase, q, uView).rgb, 1.0) : atArt(uPrev, q, uView);
}

void main() {
  vec2 p = artAt(vUv, uView);
  vec4 prev = texture(uPrev, vUv);
  vec2 l = toLocal(p, uFrame, uRot);
  float d = texture(uDist, vUv).r;
  float aa = max(fwidth(d), 1e-3) * 0.7;
  bool replace = (uOp >= 1 && uOp <= 7 && uInput == 0) || uOp == 8;
  vec4 s;
  if (uOp == 0) {
    vec2 fl = uSrcSpace == 1 ? p / uDesign
      : uSrcSpace == 2 ? (l * uFrame.zw + uPad) / (uFrame.zw + 2.0 * uPad)
      : l;
    s = sampleIn(uSrc, clamp(fl, 0.0, 1.0));
    if (uSrcSpace == 2) s.a *= inside(fl);
  } else if (uOp == 1) {
    vec2 g = toLocal(p, uGrid, uGridRot);
    s = readInput(fromLocal((floor(g * uCells) + 0.5) / uCells, uGrid, uGridRot));
  } else if (uOp == 7) {
    s = texture(uSrc, vUv);
  } else if (uOp == 8) {
    float body = uFeather > 0.0
      ? smoothstep(uFeather * 0.5 + aa, -uFeather * 0.5 - aa, d)
      : smoothstep(aa, -aa, d);
    s = vec4(prev.rgb, prev.a * body);
  } else if (uOp == 9) {
    float w = uWidth;
    if (uFibers > 0.0) {
      float fib = fbm(l * uFrame.zw * uTearScale * 3.1 + uSeed * 3.7 + 31.0);
      w *= max(0.05, 1.0 + (fib - 0.5) * 2.0 * uFibers);
    }
    float lo = (uAlign == 0 ? -w : uAlign == 2 ? 0.0 : -w * 0.5) + uOffset;
    float hi = lo + w;
    s = texture(uSrc, vUv);
    s.a *= smoothstep(lo - aa, lo + aa, d) * smoothstep(hi + aa, hi - aa, d);
    if (uSide > 0) {
      // One side only, as in Figma: the band along that edge, running the
      // full length with square ends. \`inward\` is how far inside that edge.
      vec2 px = l * uFrame.zw;
      float inward = uSide == 1 ? px.y
        : uSide == 2 ? uFrame.w - px.y
        : uSide == 3 ? px.x
        : uFrame.z - px.x;
      float reach = max(-lo, 0.0);
      float fw = max(fwidth(inward), 1e-4);
      s.a *= smoothstep(reach + fw, reach - fw, inward);
    }
  } else {
    s = readInput(p);
    if (uOp == 2) s.rgb = vec3(luma(s.rgb));
    if (uOp == 3) s.rgb = 1.0 - s.rgb;
    if (uOp == 4) s.rgb = floor(s.rgb * uAmount + 0.5) / uAmount;
    if (uOp == 5) s.rgb = vec3(step(uAmount, luma(s.rgb)));
    if (uOp == 10) {
      vec2 cell = floor(gl_FragCoord.xy / max(uGrainPx, 1.0));
      vec2 q = fract((cell + fract(uTime * 7.31) * 113.0) * vec2(443.897, 441.423));
      q += dot(q, q.yx + 19.19);
      s.rgb = clamp(s.rgb + (fract((q.x + q.y) * q.x) - 0.5) * uAmount, 0.0, 1.0);
    }
    if (uOp == 11) {
      vec2 dv = p / uDesign - 0.5;
      s.rgb *= 1.0 - uAmount * smoothstep(0.2, 0.8, dot(dv, dv) * 2.0);
    }
    if (uOp == 6) {
      float t = bayer4(floor(l * uFrame.zw / uAmount));
      s.rgb = mix(uInk, uPaper, step(t, luma(s.rgb)));
    }
  }

  vec3 bl = clamp(blend(prev.rgb, s.rgb, uBlend), 0.0, 1.0);
  if (replace) {
    outColor = mix(prev, vec4(bl, s.a), uOpacity);
  } else {
    // Laid over: blended only where there's something below.
    float sa = s.a * uOpacity;
    vec3 sc = mix(s.rgb, bl, prev.a);
    float oa = sa + prev.a * (1.0 - sa);
    vec3 oc = oa > 0.0 ? (sc * sa + prev.rgb * prev.a * (1.0 - sa)) / oa : vec3(0.0);
    outColor = vec4(oc, oa);
  }
}`;

// One direction of a Gaussian blur, `uRadius` pixels each way. Run across,
// then down. Alpha is blurred with the colour, weighted, so a transparent
// surround doesn't darken the edge.
export const BLUR_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uStep;
uniform float uRadius;
uniform bool uOpaque;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  float sigma = max(uRadius * 0.5, 0.5);
  for (int i = -24; i <= 24; i++) {
    float x = float(i) / 24.0 * uRadius;
    float w = exp(-0.5 * x * x / (sigma * sigma));
    vec4 c = texture(uSrc, vUv + uStep * x);
    if (uOpaque) c.a = 1.0;
    acc += vec4(c.rgb * c.a, c.a) * w;
    wsum += w;
  }
  acc /= wsum;
  outColor = vec4(acc.a > 0.0 ? acc.rgb / acc.a : vec3(0.0), acc.a);
}`;

// One built layer over the composite so far: its shadows (the outline from
// the distance buffer, offset and softened), then the layer, masked and
// blended over the base.
export const LAYER_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uBase;
uniform sampler2D uLayer;
uniform sampler2D uDist;
uniform sampler2D uMask;
uniform vec2 uDesign;
uniform vec4 uView;
uniform int uShadows;
uniform vec4 uShadowGeo[8];
uniform vec4 uShadowColor[8];
uniform vec4 uMaskFrame;
uniform float uMaskRot;
uniform int uMaskMode;
uniform bool uMaskInvert;
uniform float uOpacity;
uniform int uBlend;
in vec2 vUv;
out vec4 outColor;
${COMMON}
void main() {
  // The artwork so far, or a folder's layers so far (which can be clear).
  vec4 base = texture(uBase, vUv);
  vec2 p = artAt(vUv, uView);
  float aa = max(fwidth(texture(uDist, vUv).r), 1e-3) * 0.7;
  vec4 src = texture(uLayer, vUv);

  float mv = 1.0;
  if (uMaskMode > 0) {
    vec2 ml = toLocal(p, uMaskFrame, uMaskRot);
    vec4 m = texture(uMask, vUv);
    mv = (uMaskMode == 2 ? luma(m.rgb) * m.a : m.a) * inside(ml);
    if (uMaskInvert) mv = 1.0 - mv;
  }

  for (int i = 0; i < 8; i++) {
    if (i >= uShadows) break;
    vec4 g = uShadowGeo[i];
    float ds = atArt(uDist, p - g.xy, uView).r;
    float b = g.z * 0.5 + aa;
    float sh = uShadowColor[i].a * smoothstep(b, -b, ds) * uOpacity * mv;
    base = over(base, uShadowColor[i].rgb, sh, 0);
  }

  outColor = over(base, src.rgb, src.a * uOpacity * mv, uBlend);
}`;

// A folder's composited layers onto what's below it. Mode 0 lays the folder
// itself (opacity, blend, mask); mode 1 lays one of its shadows: a blurred
// copy of its alpha, offset and tinted.
export const GROUP_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uBase;
uniform sampler2D uSrc;
uniform sampler2D uMask;
uniform vec4 uView;
uniform int uMode;
uniform vec2 uOffset;
uniform vec4 uColor;
uniform int uMaskMode;
uniform bool uMaskInvert;
uniform vec4 uMaskFrame;
uniform float uMaskRot;
uniform float uOpacity;
uniform int uBlend;
in vec2 vUv;
out vec4 outColor;
${COMMON}
void main() {
  vec4 base = texture(uBase, vUv);
  vec2 p = artAt(vUv, uView);
  float mv = 1.0;
  if (uMaskMode > 0) {
    vec4 m = texture(uMask, vUv);
    mv = (uMaskMode == 2 ? luma(m.rgb) * m.a : m.a) * inside(toLocal(p, uMaskFrame, uMaskRot));
    if (uMaskInvert) mv = 1.0 - mv;
  }
  if (uMode == 1) {
    float a = atArt(uSrc, p - uOffset, uView).a * uColor.a * uOpacity * mv;
    outColor = over(base, uColor.rgb, a, 0);
  } else {
    vec4 g = texture(uSrc, vUv);
    outColor = over(base, g.rgb, g.a * uOpacity * mv, uBlend);
  }
}`;

export const POST_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform float uTime;
uniform float uGrain;
uniform float uGrainSize;
uniform float uVignette;
uniform vec4 uView;
uniform vec2 uDesign;
uniform vec3 uSurround;
in vec2 vUv;
out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

void main() {
  vec3 c = texture(uSrc, vUv).rgb;
  if (uGrain > 0.0) {
    vec2 cell = floor(vUv * uRes / uGrainSize);
    float n = hash(cell + fract(uTime * 7.31) * 113.0) - 0.5;
    c += n * uGrain;
  }
  // Where this pixel is on the artwork, 0..1; outside it is the surround.
  vec2 art = (uView.xy + vec2(vUv.x, 1.0 - vUv.y) * uView.zw) / uDesign;
  if (uVignette > 0.0) {
    vec2 d = art - 0.5;
    c *= 1.0 - uVignette * smoothstep(0.2, 0.8, dot(d, d) * 2.0);
  }
  bool past = any(lessThan(art, vec2(0.0))) || any(greaterThan(art, vec2(1.0)));
  outColor = vec4(past ? uSurround : clamp(c, 0.0, 1.0), 1.0);
}`;
