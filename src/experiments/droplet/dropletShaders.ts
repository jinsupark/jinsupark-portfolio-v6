export const quadVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Separable gaussian over the drawn mask. Its result is the water's height
// field: 0.5 lands on the drawn outline, rising to 1 a blur-width inside it.
export const blurFrag = /* glsl */ `
uniform sampler2D tIn;
uniform vec2 dir;
uniform float radius;
varying vec2 vUv;
void main() {
  float sigma = max(radius * 0.5, 0.5);
  float st = radius / 16.0;
  float sum = 0.0;
  float wsum = 0.0;
  for (int i = -16; i <= 16; i++) {
    float x = float(i) * st;
    float w = exp(-x * x / (2.0 * sigma * sigma));
    sum += texture2D(tIn, vUv + dir * x).r * w;
    wsum += w;
  }
  gl_FragColor = vec4(vec3(sum / wsum), 1.0);
}
`;

export const waterFrag = /* glsl */ `
uniform sampler2D tBg;
uniform sampler2D tH;
uniform vec2 res;
uniform vec2 texel;
uniform vec2 fit;
uniform vec2 fitOff;
uniform float time;
uniform float thickness;
uniform float refract;
uniform float parallax;
uniform float chroma;
uniform float wobble;
uniform float specular;
uniform float shininess;
uniform float rim;
uniform float rimDark;
uniform vec2 light;
uniform vec3 tint;
uniform float tintAmt;
uniform float shadow;
uniform vec2 shadowOff;
uniform vec3 shadowColor;
uniform float caustics;
varying vec2 vUv;

// Flat on top, rounding off steeply at the outline, like a puddle's meniscus.
float prof(float m) {
  float t = clamp((m - 0.5) * 2.0, 0.0, 1.0);
  return 1.0 - pow(1.0 - t, 2.5);
}
float M(vec2 uv) { return texture2D(tH, uv).r; }
// Screen uv to backdrop uv: a scale and offset, so the backdrop can be a
// cover-fitted video or a window onto a page taller than the screen.
vec3 bg(vec2 uv) { return texture2D(tBg, clamp(uv * fit + fitOff, 0.0, 1.0)).rgb; }

void main() {
  vec2 uv = vUv;
  vec2 wv = wobble * 0.002 * vec2(
    sin(uv.y * 7.0 + time * 1.3) + 0.6 * sin(uv.x * 11.0 - time * 0.8),
    cos(uv.x * 6.0 - time * 1.1) + 0.6 * cos(uv.y * 13.0 + time * 0.9));
  vec2 q = uv + wv;
  float m = M(q);
  vec2 e = texel * 1.5;
  float zl = prof(M(q - vec2(e.x, 0.0)));
  float zr = prof(M(q + vec2(e.x, 0.0)));
  float zd = prof(M(q - vec2(0.0, e.y)));
  float zu = prof(M(q + vec2(0.0, e.y)));
  float z = prof(m);
  vec2 g = vec2(zr - zl, zu - zd) * thickness / (2.0 * e * res);
  vec3 n = normalize(vec3(-g, 1.0));

  // The backdrop, darkened by the drop's shadow and lit by its caustic.
  vec2 qs = uv - shadowOff / res;
  float ms = M(qs);
  float sh = smoothstep(0.2, 0.75, ms) * shadow;
  float edge =
    abs(prof(M(qs + vec2(e.x, 0.0))) - prof(M(qs - vec2(e.x, 0.0)))) +
    abs(prof(M(qs + vec2(0.0, e.y))) - prof(M(qs - vec2(0.0, e.y))));
  vec3 base = bg(uv) * mix(vec3(1.0), shadowColor, sh);
  base += caustics * shadow * edge * vec3(0.9, 0.97, 1.0);

  // Through the water: bent by the surface slope, split per channel.
  vec2 off = (-n.xy * refract - parallax * z * vec2(0.6, -1.0)) / res;
  vec3 col = vec3(
    bg(uv + off * (1.0 + chroma)).r,
    bg(uv + off).g,
    bg(uv + off * (1.0 - chroma)).b);
  col = mix(col, tint, tintAmt);

  float fres = pow(1.0 - n.z, 1.5);
  vec2 L = normalize(light);
  float facing = dot(normalize(n.xy + 1e-5), L);
  col *= 1.0 - rimDark * fres * max(0.0, -facing);
  col += rim * fres * max(0.0, facing);
  vec3 h = normalize(normalize(vec3(L * 0.7, 0.7)) + vec3(0.0, 0.0, 1.0));
  col += specular * pow(max(dot(n, h), 0.0), shininess);

  float fw = fwidth(m) + 1e-4;
  float a = smoothstep(0.5 - fw, 0.5 + fw, m);
  gl_FragColor = vec4(mix(base, col, a), 1.0);
}
`;
