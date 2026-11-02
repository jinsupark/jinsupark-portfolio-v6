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

// One layer over the composite so far. The layer's shape is a distance field
// (a texture, or the frame's own rectangle worked out exactly), folded with up
// to three other shapes, torn by noise anchored to the layer; the fill, paper
// core and stroke are cut from that, its offset copy is the shadow, and the
// result is filtered, masked and blended over the base.
export const LAYER_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uBase;
uniform sampler2D uLayer;
uniform sampler2D uMask;
uniform vec2 uDesign;
uniform vec4 uFrame;
uniform float uRot;
uniform sampler2D uShape;
uniform int uShapeMode;
uniform float uPad;
uniform bool uFillCanvas;
uniform bool uStyle;
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
uniform float uTear;
uniform float uTearScale;
uniform float uSeed;
uniform float uCore;
uniform float uFibers;
uniform vec3 uCoreColor;
uniform float uStroke;
uniform int uStrokeAlign;
uniform vec3 uStrokeColor;
uniform float uFeather;
uniform float uShadow;
uniform vec2 uShadowOff;
uniform float uShadowBlur;
uniform vec3 uShadowColor;
uniform vec4 uMaskFrame;
uniform float uMaskRot;
uniform int uMaskMode;
uniform bool uMaskInvert;
uniform float uOpacity;
uniform int uBlend;
uniform float uPixelate;
uniform bool uMono;
uniform bool uInvert;
uniform float uPosterize;
uniform float uThreshold;
uniform bool uDither;
uniform float uDitherScale;
uniform vec3 uInk;
uniform vec3 uPaper;
in vec2 vUv;
out vec4 outColor;

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

vec3 blend(vec3 b, vec3 s) {
  if (uBlend == 1) return b * s;
  if (uBlend == 2) return 1.0 - (1.0 - b) * (1.0 - s);
  if (uBlend == 3) return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, b));
  if (uBlend == 4) return min(b, s);
  if (uBlend == 5) return max(b, s);
  if (uBlend == 6) return abs(b - s);
  if (uBlend == 7) return b + s - 2.0 * b * s;
  if (uBlend == 8) return mix(min(vec3(1.0), b / max(1.0 - s, 1e-4)), vec3(0.0), step(b, vec3(0.0)));
  if (uBlend == 9) return mix(1.0 - min(vec3(1.0), (1.0 - b) / max(s, 1e-4)), vec3(1.0), step(vec3(1.0), b));
  if (uBlend == 10) return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, s));
  if (uBlend == 11) {
    vec3 d = mix(((16.0 * b - 12.0) * b + 4.0) * b, sqrt(b), step(0.25, b));
    return mix(b - (1.0 - 2.0 * s) * b * (1.0 - b), b + (2.0 * s - 1.0) * (d - b), step(0.5, s));
  }
  if (uBlend == 12) return min(vec3(1.0), b + s);
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

// The layer's whole outline at p, booleans and tear included.
float shapeD(vec2 p) {
  float d = sdfOf(uShape, uShapeMode, p, uFrame, uRot, uPad);
  if (uOpKind.x > 0) d = combine(d, sdfOf(uOp0, uOpMode.x, p, uOpFrame0, uOpRot.x, uOpPad.x), uOpKind.x);
  if (uOpKind.y > 0) d = combine(d, sdfOf(uOp1, uOpMode.y, p, uOpFrame1, uOpRot.y, uOpPad.y), uOpKind.y);
  if (uOpKind.z > 0) d = combine(d, sdfOf(uOp2, uOpMode.z, p, uOpFrame2, uOpRot.z, uOpPad.z), uOpKind.z);
  if (uTear > 0.0) {
    // Anchored to the layer, so a torn edge travels with it.
    vec2 q = toLocal(p, uFrame, uRot) * uFrame.zw;
    float n = fbm(q * uTearScale + uSeed * 7.13);
    d += (n - 0.5) * 2.4 * uTear;
  }
  return d;
}

void main() {
  vec3 base = texture(uBase, vUv).rgb;
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uDesign;
  vec2 l = toLocal(p, uFrame, uRot);

  float d = shapeD(p);
  float aa = max(fwidth(d), 1e-3) * 0.7;
  float body = uFeather > 0.0
    ? smoothstep(uFeather * 0.5 + aa, -uFeather * 0.5 - aa, d)
    : smoothstep(aa, -aa, d);

  float coreM = 0.0;
  if (uCore > 0.0) {
    vec2 q = l * uFrame.zw;
    float fib = fbm(q * uTearScale * 3.1 + uSeed * 3.7 + 31.0);
    float w = uCore * max(0.05, 1.0 + (fib - 0.5) * 2.0 * uFibers);
    coreM = body * smoothstep(-aa, aa, d + w);
  }
  float strokeM = 0.0;
  if (uStroke > 0.0) {
    float lo = uStrokeAlign == 0 ? -uStroke : uStrokeAlign == 2 ? 0.0 : -uStroke * 0.5;
    float hi = lo + uStroke;
    strokeM = smoothstep(lo - aa, lo + aa, d) * smoothstep(hi + aa, hi - aa, d);
  }

  // Where the shader is read from: the frame, the frame plus pad for a shape
  // style that draws past its outline, or the whole artwork.
  vec2 fl = uFillCanvas ? p / uDesign
    : uStyle ? (l * uFrame.zw + uPad) / (uFrame.zw + 2.0 * uPad)
    : l;
  vec2 sl = fl;
  if (uPixelate > 0.0) {
    vec2 cells = vec2(uPixelate, uPixelate * uFrame.w / uFrame.z);
    sl = (floor(fl * cells) + 0.5) / cells;
  }
  vec4 src = sampleIn(uLayer, clamp(sl, 0.0, 1.0));
  vec3 c = src.rgb;
  if (uMono) c = vec3(luma(c));
  if (uInvert) c = 1.0 - c;
  if (uPosterize > 0.0) c = floor(c * uPosterize + 0.5) / uPosterize;
  if (uThreshold > 0.0) c = vec3(step(uThreshold, luma(c)));
  if (uDither) {
    float t = bayer4(floor(l * uFrame.zw / uDitherScale));
    c = mix(uInk, uPaper, step(t, luma(c)));
  }
  float a;
  if (uStyle) {
    // A shape style draws its own shape; the frame plus pad is its canvas.
    a = src.a * inside(fl);
  } else {
    a = body * src.a;
    c = mix(c, uCoreColor, coreM);
    a = max(a, coreM);
    c = mix(c, uStrokeColor, strokeM);
    a = max(a, strokeM);
  }

  float mv = 1.0;
  if (uMaskMode > 0) {
    vec2 ml = toLocal(p, uMaskFrame, uMaskRot);
    vec4 m = sampleIn(uMask, clamp(ml, 0.0, 1.0));
    mv = (uMaskMode == 2 ? luma(m.rgb) * m.a : m.a) * inside(ml);
    if (uMaskInvert) mv = 1.0 - mv;
  }

  if (uShadow > 0.0) {
    float ds = shapeD(p - uShadowOff);
    float b = uShadowBlur * 0.5 + aa;
    float sh = uShadow * smoothstep(b, -b, ds) * uOpacity * mv;
    base = mix(base, uShadowColor, sh);
  }

  a *= uOpacity * mv;
  outColor = vec4(mix(base, clamp(blend(base, c), 0.0, 1.0), a), 1.0);
}`;

export const POST_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform float uTime;
uniform float uGrain;
uniform float uGrainSize;
uniform float uVignette;
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
  if (uVignette > 0.0) {
    vec2 d = vUv - 0.5;
    c *= 1.0 - uVignette * smoothstep(0.2, 0.8, dot(d, d) * 2.0);
  }
  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;
