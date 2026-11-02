export const MAX_LOBES = 40;

export const cloudVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Space is screen height units, y up from the bottom edge, x centred.
// Each lobe is a sphere (x, y, radius, depth bias): their smooth union is the
// silhouette, and the front-most sphere under a pixel gives its normal, so
// every lobe shades as a ball and the ones behind show at its rim.
export const cloudFrag = /* glsl */ `
#define MAX_LOBES ${MAX_LOBES}
uniform vec2 res;
uniform float time;
uniform vec4 lobes[MAX_LOBES];
uniform int count;
uniform vec3 skyTop;
uniform vec3 skyBottom;
uniform vec3 cShade;
uniform vec3 cMid;
uniform vec3 cLight;
uniform vec3 cLace;
uniform vec2 light;
uniform float merge;
uniform float roughness;
uniform float detail;
uniform float boil;
uniform float laceAmount;
uniform float laceWidth;
uniform float laceScale;
uniform float edgeLine;
uniform float brush;
uniform float grain;
varying vec2 vUv;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
        mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
        mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * noise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s;
}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / max(k, 1e-4), 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float h2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 p = vec2((vUv.x - 0.5) * res.x / res.y, vUv.y);
  float t = time * boil;

  vec3 sky = mix(skyBottom, skyTop, smoothstep(0.0, 1.0, vUv.y));
  sky += (fbm(vec3(p * vec2(1.2, 5.0), 3.0)) - 0.5) * 0.05;

  // The surface is a soft maximum of the lobes' heights, so neighbouring
  // lobes blend into one body while each still shows its own rim. Running
  // rescale keeps the exponentials in range.
  float ds = 1e3;
  float zmax = -1e3;
  float wsum = 0.0;
  vec3 Nacc = vec3(0.0);
  float rimAcc = 0.0;
  float k = merge * 0.3 + 0.006;
  for (int i = 0; i < MAX_LOBES; i++) {
    if (i >= count) break;
    vec4 L = lobes[i];
    vec2 q = p - L.xy;
    float dist = length(q);
    ds = smin(ds, dist - L.z, merge);
    float hh = L.z * L.z - dist * dist;
    float h = hh > 0.0 ? sqrt(hh) : -(dist - L.z) * 2.0;
    // Lower lobes stand nearer the viewer, as a tower seen from the ground.
    float z = h - L.y * 0.6 + L.w;
    if (z > zmax) {
      float s = exp((zmax - z) / k);
      wsum *= s;
      Nacc *= s;
      rimAcc *= s;
      zmax = z;
    }
    float w = exp((z - zmax) / k);
    wsum += w;
    Nacc += w * normalize(vec3(q, max(h, 0.0) + 1e-4));
    rimAcc += w * clamp(dist / max(L.z, 1e-4), 0.0, 1.0);
  }
  vec3 N = wsum > 0.0 ? normalize(Nacc) : vec3(0.0, 0.0, 1.0);
  float rimT = wsum > 0.0 ? rimAcc / wsum : 1.0;

  // The churn: noise moving through time and drifting upward, so the edge
  // boils in place rather than sliding.
  vec3 np = vec3(p * detail, t);
  np.y -= t * 0.6;
  float n = fbm(np);
  float n2 = fbm(np * 2.7 + vec3(5.2, 1.3, 0.0));
  float d = ds + (n - 0.5) * roughness + (n2 - 0.5) * roughness * 0.45;
  // Painted, not modelled: the noise bends each lobe's normal so the balls
  // break into washes.
  N = normalize(N + vec3((n - 0.5) * 1.4, (n2 - 0.5) * 1.4, 0.0));
  float aa = fwidth(d) * 1.2 + 1e-5;
  float m = smoothstep(aa, -aa, d);

  vec2 sun = normalize(light);
  vec3 Ld = normalize(vec3(sun, 0.55));
  float lam = dot(N, Ld) * 0.5 + 0.5;
  float val = mix(0.55, lam, 0.6) + 0.25 * smoothstep(0.0, 0.9, p.y) - 0.1;
  val -= smoothstep(0.8, 1.0, rimT) * 0.1;
  val += (fbm(vec3(p * vec2(4.0, 16.0) + n, 7.0)) - 0.5) * brush;
  vec3 col = mix(cShade, cMid, smoothstep(0.25, 0.6, val));
  col = mix(col, cLight, smoothstep(0.62, 0.92, val));

  // Lace: crisp white fringes on the sunlit rims of each lobe and along the
  // silhouette, broken up by fine noise like a carved block.
  float ln = fbm(vec3(p * laceScale, t * 1.5 + 11.0));
  float up = smoothstep(-0.1, 0.6, dot(N.xy, sun));
  float band = smoothstep(1.0 - laceWidth, 1.0, rimT) * up;
  float lx = band * laceAmount + (ln - 0.5) * 1.6 - 0.1;
  float laceM = smoothstep(0.6, 0.64, lx) * step(0.001, laceAmount);
  float edgeB = smoothstep(-edgeLine * (0.3 + 1.7 * up), 0.0, d);
  float edgeM = smoothstep(0.5, 0.55, edgeB + (ln - 0.5) * 0.9);
  col = mix(col, cLace, max(laceM, edgeM));

  vec3 outc = mix(sky, col, m);
  float g = h2(gl_FragCoord.xy);
  float fib = fbm(vec3(p * vec2(90.0, 7.0), 1.0));
  outc *= 1.0 + (g - 0.5) * grain + (fib - 0.5) * grain * 0.8;
  gl_FragColor = vec4(outc, 1.0);
}
`;
