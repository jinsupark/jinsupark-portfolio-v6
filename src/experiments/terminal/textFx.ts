// The terminal's raw material: a stateless hash, the scramble, and the vocabulary.
// The vocabulary leans on the real catalogue, so what scrolls past is the work
// being loaded and indexed rather than lorem ipsum in a monospace font.

import { PROJECT_LIST } from '@/data/projects';

export function hash(a: number, b = 0, c = 0) {
  let x =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  x = Math.imul(
    x ^ (x >>> 15) ^ Math.imul(c + 0x165667b1, 0x27d4eb2f),
    0x85ebca6b,
  );
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=/<>[]{}';

// `p` runs 0 → 1 over the scramble. Characters settle roughly left to right,
// with some jitter so it reads as decoding rather than as a wipe. `tick` is the
// glyph clock: unsettled characters change on every tick.
export function scrambled(
  target: string,
  p: number,
  salt: number,
  tick: number,
) {
  if (p >= 1) return target;
  let out = '';
  for (let i = 0; i < target.length; i++) {
    const ch = target[i];
    if (ch === ' ') {
      out += ' ';
      continue;
    }
    const at = (i / Math.max(1, target.length)) * 0.7 + hash(salt, i) * 0.3;
    out +=
      p >= at ? ch : GLYPHS[Math.floor(hash(salt, i, tick) * GLYPHS.length)];
  }
  return out;
}

export type Rng = () => number;
export const pick = <T>(rng: Rng, a: readonly T[]) =>
  a[Math.floor(rng() * a.length)];
export const hex = (rng: Rng, n: number) =>
  Math.floor(rng() * 16 ** n)
    .toString(16)
    .toUpperCase()
    .padStart(n, '0');
export const int = (rng: Rng, lo: number, hi: number) =>
  lo + Math.floor(rng() * (hi - lo + 1));
const letters = (rng: Rng, n: number) =>
  Array.from({ length: n }, () =>
    String.fromCharCode(65 + Math.floor(rng() * 26)),
  ).join('');

export const PROJECTS = PROJECT_LIST.map((p) => ({
  key: `${p.year}/${p.id}`,
  name: p.name.toUpperCase(),
  year: p.year,
}));

const REGIONS = [
  'us-east-1',
  'eu-west-2',
  'ap-se-1',
  'sgp-03',
  'fra-01',
  'icn-02',
];
const SHADERS = [
  'tear.frag',
  'glass.frag',
  'bloom.comp',
  'grid.vert',
  'paint.frag',
];

export type Level = 'INF' | 'OK ' | 'DBG' | 'WRN' | 'ERR';

const LOGS: ((r: Rng) => [Level, string])[] = [
  (r) => ['OK ', `LOAD ${pick(r, PROJECTS).key} .......... done`],
  (r) => ['INF', `INDEX ${pick(r, PROJECTS).key} [${int(r, 3, 40)} assets]`],
  (r) => ['INF', `SYNC node-${hex(r, 2)} -> 0x${hex(r, 4)} ${int(r, 2, 90)}ms`],
  (r) => ['DBG', `RENDER frame ${int(r, 1000, 99999)} @ ${int(r, 58, 144)}fps`],
  (r) => [
    'DBG',
    `ALLOC ${int(r, 2, 512)}MB tex ${pick(r, [512, 1024, 2048])}x${pick(r, [512, 1024])}`,
  ],
  (r) => ['WRN', `latency ${int(r, 120, 900)}ms on ${pick(r, REGIONS)}`],
  (r) => [
    'INF',
    `TRAIN epoch ${int(r, 1, 400)} loss ${(r() * 0.9).toFixed(4)}`,
  ],
  (r) => [
    'OK ',
    `HANDSHAKE ${int(r, 10, 250)}.${int(r, 0, 255)}.${int(r, 0, 255)}.${int(r, 1, 254)}`,
  ],
  (r) => ['INF', `COMPILE ${pick(r, SHADERS)} ... ok`],
  (r) => ['DBG', `MOUNT /work/${pick(r, PROJECTS).year} ro`],
  (r) => ['ERR', `checksum mismatch 0x${hex(r, 8)}`],
  (r) => [
    'INF',
    `FETCH ${pick(r, PROJECTS).name.toLowerCase()} ${int(r, 40, 2400)}kb`,
  ],
];
const LOG_WEIGHTS = [3, 3, 3, 2, 2, 1, 2, 1, 1, 1, 0.3, 2];
const LOG_TOTAL = LOG_WEIGHTS.reduce((a, b) => a + b, 0);

export function logLine(rng: Rng): [Level, string] {
  let x = rng() * LOG_TOTAL;
  for (let i = 0; i < LOGS.length; i++) {
    x -= LOG_WEIGHTS[i];
    if (x <= 0) return LOGS[i](rng);
  }
  return LOGS[0](rng);
}

// hh:mm:ss.mmm, running from a fixed hour so a reload doesn't read as a reset.
export function stamp(sec: number) {
  const s = 51727 + sec;
  const p = (n: number, w = 2) => String(Math.floor(n)).padStart(w, '0');
  return `${p((s / 3600) % 24)}:${p((s / 60) % 60)}:${p(s % 60)}.${p((s % 1) * 1000, 3)}`;
}

// The survey-sheet lines from the reference: coordinates and codes with no
// stated meaning, which is what makes them read as instrumentation.
export const SPEC_LINES: ((r: Rng) => string)[] = [
  (r) => `0'${int(r, 0, 9)} ${letters(r, 6)}`,
  (r) => `${int(r, 10, 89)}°${pick(r, ['N', 'S'])} ${int(r, 0, 59)}'`,
  (r) => `E ${int(r, 1, 9)}`,
  (r) => `${int(r, 10, 31)}.${int(r, 10, 12)} ${letters(r, 3)}`,
  (r) =>
    `SC.T${int(r, 1, 9)} ${int(r, 100, 999)} ${letters(r, 2)}${int(r, 1, 9)}`,
  (r) =>
    `${int(r, 100, 999)} ${letters(r, 3)} ${int(r, 100, 999)} ${letters(r, 3)}`,
];

export const READOUT_FIELDS = [
  { label: 'LAT', digits: 4, unit: '', base: 37.5, step: 0.02 },
  { label: 'LON', digits: 4, unit: '', base: 126.9, step: 0.02 },
  { label: 'ALT', digits: 1, unit: 'm', base: 412, step: 6 },
  { label: 'VEL', digits: 2, unit: '', base: 3.2, step: 0.4 },
  { label: 'HDG', digits: 0, unit: '°', base: 214, step: 9 },
  { label: 'FPS', digits: 0, unit: '', base: 120, step: 6 },
  { label: 'MEM', digits: 1, unit: 'GB', base: 6.4, step: 0.3 },
  { label: 'LOSS', digits: 4, unit: '', base: 0.21, step: 0.01 },
  { label: 'EPOCH', digits: 0, unit: '', base: 128, step: 3 },
  { label: 'TEMP', digits: 1, unit: '°C', base: 61, step: 1.5 },
  { label: 'LOAD', digits: 0, unit: '%', base: 64, step: 7 },
  { label: 'Δt', digits: 2, unit: 'ms', base: 8.3, step: 0.9 },
  { label: 'NODE', digits: 0, unit: '', base: 31, step: 2 },
  { label: 'SYNC', digits: 1, unit: '%', base: 98.2, step: 0.6 },
] as const;

export const BAR_LABELS = [
  'UPLINK',
  'DECODE',
  'INDEX',
  'RENDER',
  'CACHE',
  'TRAIN',
  'SYNC',
  'PARSE',
  'BUILD',
  'MOUNT',
];
export const BIG_WORDS = [
  'SYNCED',
  'X5',
  'MISS',
  'ONLINE',
  'LIVE',
  'HOLD',
  'ACK',
  'IDLE',
];
