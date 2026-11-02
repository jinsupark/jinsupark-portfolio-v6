// One instanced box per window. A box's footprint is the window's rect on a
// tile of the slanted plane, its height comes from its id, and its top face
// shows the window's region of the terminal texture. Everything about the glass
// and the light is in the fragment shader, in world space, so the light stays
// put while the surface pans beneath it.

export const glassVert = /* glsl */ `
  attribute vec4 aBox;  // world x0, z0, width, depth
  attribute vec4 aMeta; // height, rand, reflective, work cell
  attribute vec4 aUv;   // content u0, v0, du, dv
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vLocal;
  varying vec4 vBox;
  varying vec4 vMeta;
  varying vec4 vUv;
  void main() {
    // The box geometry spans x, z in [-0.5, 0.5] and y in [0, 1].
    vLocal = position + vec3(0.5, 0.0, 0.5);
    vec3 w = vec3(aBox.x + vLocal.x * aBox.z, vLocal.y * aMeta.x, aBox.y + vLocal.z * aBox.w);
    vWorld = w;
    vNormal = normal;
    vBox = aBox;
    vMeta = aMeta;
    vUv = aUv;
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  }
`;

export const glassFrag = /* glsl */ `
  uniform sampler2D uContent;
  uniform sampler2D uWork;
  uniform float uTime;
  uniform vec3 uLight;
  uniform vec3 uBg;
  uniform vec2 uPan;
  uniform float uContentGain;
  uniform float uSide;
  uniform float uEdge;
  uniform float uEdgeW;
  uniform float uSpec;
  uniform float uShine;
  uniform float uFog;
  uniform float uReflAmt;
  uniform float uReflAll;
  uniform float uReflScale;
  uniform float uFresnel;
  uniform float uSweepAmt;
  uniform float uSweepW;
  uniform float uSweepFreq;
  uniform float uSweepSpeed;
  uniform vec2 uSweepDir;
  uniform float uSweepGap;
  uniform float uSweepFollow;
  uniform float uSpread;
  uniform float uMeshFreq;
  uniform float uMeshAmt;
  uniform float uFringe;
  uniform float uFringeW;
  uniform float uFringeFreq;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vLocal;
  varying vec4 vBox;
  varying vec4 vMeta;
  varying vec4 vUv;

  float h1(float n) { return fract(sin(n * 127.1 + 3.7) * 43758.5453); }
  // Saturated hue wheel: the colours of a grating, not of a pastel gradient.
  vec3 spectrum(float x) {
    return clamp(abs(fract(x + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  }

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLight);
    float top = step(0.5, N.y);
    float ndl = max(dot(N, L), 0.0);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);

    // Distance to the nearest edge of whichever face this is, in world units.
    float H = vMeta.x;
    float dx = (0.5 - abs(vLocal.x - 0.5)) * vBox.z;
    float dz = (0.5 - abs(vLocal.z - 0.5)) * vBox.w;
    float dy = min(vLocal.y, 1.0 - vLocal.y) * H;
    float e = top > 0.5 ? min(dx, dz) : (abs(N.x) > 0.5 ? min(dz, dy) : min(dx, dy));

    // Sampled unconditionally: texture derivatives inside a per-face branch
    // are undefined where a pixel quad straddles two faces.
    vec2 uv = vec2(vUv.x + vLocal.x * vUv.z, vUv.y + (1.0 - vLocal.z) * vUv.w);
    vec3 content = texture2D(uContent, uv).rgb * uContentGain;

    // A reflection depends on the view direction, not on where the window is,
    // so the reflected work holds still on screen while the glass pans under it.
    vec3 R = reflect(-V, N);
    vec2 ruv = R.xz * uReflScale + vMeta.y * 3.0;
    ruv = abs(fract(ruv * 0.5) * 2.0 - 1.0); // mirrored repeat, no seams
    vec2 cell = vec2(mod(vMeta.w, 4.0), floor(vMeta.w / 4.0));
    vec2 auv = (cell + 0.02 + ruv * 0.96) / vec2(4.0, 2.0);
    vec3 work = texture2D(uWork, auv).rgb;
    float refl = mix(uReflAll, uReflAmt, vMeta.z) * mix(1.0, 0.2 + fres * 3.0, uFresnel);

    vec3 side = vec3(uSide) * mix(0.35, 1.0, vLocal.y) * (0.4 + 0.6 * ndl) + uSide * 2.0 * fres;
    vec3 col = mix(side, content + work * refl, top);

    vec3 Hh = normalize(L + V);
    col += pow(max(dot(N, Hh), 0.0), uShine) * uSpec * mix(0.4, 1.0, top);

    float aa = fwidth(e) * 1.2 + 1e-5;
    float line = 1.0 - smoothstep(uEdgeW, uEdgeW + aa, e);
    col += line * uEdge * (0.35 + 0.65 * ndl);

    // The sweep: broad bands of light sliding across the surface, each lit or
    // not by its own coin flip, coloured like a diffraction grating — the hue
    // turns with position across the band and with the angle you see it from.
    vec2 sp = vWorld.xz + uPan * uSweepFollow;
    float s = dot(sp, uSweepDir) * uSweepFreq - uTime * uSweepSpeed;
    float id = floor(s);
    float f = fract(s);
    float on = step(uSweepGap, h1(id));
    float band = exp(-pow((f - 0.5) / max(uSweepW, 1e-3), 2.0)) * on;
    vec3 rainbow = spectrum(f * uSpread + dot(V.xz, uSweepDir) * uSpread * 0.6 + h1(id + 7.0));

    // The light breaks up into subpixel stripes, like a screen seen too close.
    // Faded out where the mesh is finer than a pixel, which would only shimmer.
    vec2 mg = vWorld.xz * uMeshFreq;
    float sub = floor(fract(mg.x) * 3.0);
    vec3 stripe = vec3(sub < 0.5, sub > 0.5 && sub < 1.5, sub > 1.5) * 2.6;
    stripe *= smoothstep(0.08, 0.2, abs(fract(mg.y) - 0.5));
    float mfade = clamp(1.6 - length(fwidth(mg)) * 1.6, 0.0, 1.0);
    vec3 mesh = mix(vec3(1.0), stripe, uMeshAmt * mfade);
    col += rainbow * mesh * band * uSweepAmt * mix(0.4, 1.0, top);

    // Rainbow fringes where an edge catches the light, brightest inside a sweep.
    float fr = exp(-e / max(uFringeW, 1e-4)) * uFringe;
    vec3 fc = spectrum(e * uFringeFreq + dot(V, vec3(0.3, 0.5, 0.2)) * 2.0 + uTime * 0.1);
    col += fc * fr * (0.15 + band * 1.5);

    float dist = length(cameraPosition - vWorld);
    col = mix(uBg, col, exp(-dist * uFog));
    gl_FragColor = vec4(col, 1.0);
  }
`;
