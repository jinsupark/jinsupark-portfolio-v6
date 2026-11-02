// The small print pinned to the junctions: survey addresses, coordinates,
// status lines and asset paths. Quiet by design: it reads as a drawing's
// annotation layer, not as a terminal, so nothing here scrolls.

import { hex, int, pick, PROJECTS, type Rng } from '../terminal/textFx';

const SCALES = ['1:25K', '1:50K', '1:100K', '1:250K'];
const INFO = [
  'Data stream',
  'entropy',
  'tile cache warm',
  'sync ok',
  'layer norm',
];
const ERRORS = ['No metadata', 'checksum drift', 'missing tile', 'stale index'];

const lat = (r: Rng) => (int(r, 100, 899) / 10).toFixed(1);
const lon = (r: Rng) => `-${(int(r, 1000, 1799) / 10).toFixed(1)}`;
const project = (r: Rng) => pick(r, PROJECTS);

const BLOCKS: ((r: Rng) => string[])[] = [
  (r) => [
    `addr: 0x${hex(r, 4)}`,
    `coord: (${lat(r)}, ${lon(r)})`,
    `scale: ${pick(r, SCALES)}`,
    `id: F-${int(r, 100, 999)}`,
  ],
  (r) => [`[INFO] ${pick(r, INFO)}`, `[ERROR] ${pick(r, ERRORS)}`],
  (r) => [`path: /assets/${project(r).key}`],
  (r) => {
    const p = project(r);
    return [`${p.name}`, `${p.year} · ${int(r, 1, 40)} frames`];
  },
  (r) => [`[INFO] ${pick(r, INFO)}`, `${(int(r, 2, 980) / 10).toFixed(1)} MB`],
  (r) => [`${hex(r, 2)}-${hex(r, 4)}`],
  (r) => [`ln ${int(r, 1, 99)}`, `x ${int(r, 0, 2400)} y ${int(r, 0, 1600)}`],
];

export const markText = (r: Rng) => pick(r, BLOCKS)(r);
