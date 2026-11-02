// Project imagery for the image windows: brand and art work only. The catalogue
// carries no categories (see `projects.ts`), so this is a hand-kept list —
// the projects v5 tagged `brand` or `graphic`, which leaves out the product UI.
// Product screens read as more terminal; it's the identities and illustration
// that give the wall something to look at.

import { PROJECTS, type ProjectMeta } from '@/data/projectImages';

const ART = new Set([
  '2025/onlua',
  '2024/lumebrite',
  '2023/atomic-ui',
  '2023/castle-ai',
  '2023/ent-studio',
  '2023/nverse',
  '2022/hopmedic',
  '2022/marslofi',
  '2022/moonlogo',
  '2022/north-four',
  '2022/saintsaint',
  '2022/sass',
  '2022/siwan',
  '2021/castle',
  '2020/runboy',
  '2018/portfolio',
  '2017/bonjak',
  '2017/payment-express',
  '2017/surreality',
  '2017/sveva',
  '2017/thai-aerospace',
  '2017/theory-temple',
  '2016/design-studio',
  '2016/flora',
  '2016/kikoshi',
  '2016/midas',
  '2015/atrium-theatre',
  '2015/javelin-power',
  '2013/break-reality',
  '2013/champion',
  '2013/makers-laces',
  '2012/cupids-cuppa',
  '2012/power-city',
  '2011/botanic-beauty',
  '2011/depthcore',
  '2010/ivy-heart',
  '2010/omega-code',
  '2010/pinocchio',
  '2010/speero',
  '2010/trap',
  '2009/bwmb',
  '2009/luminary-films',
  '2008/digital-art',
]);

export const ART_PROJECTS: ProjectMeta[] = PROJECTS.filter(
  (p) => ART.has(`${p.year}/${p.id}`) && p.images.length > 0,
);

export type Shot = { project: ProjectMeta; index: number };
export type Loaded = { img: HTMLImageElement; shot: Shot };

// Decoded images are big (a 1600px still is ~8MB of bitmap), so the pool keeps
// only the most recently asked-for few and lets the rest be collected.
const CAP = 24;
const cache = new Map<string, Promise<Loaded | null>>();

export function loadShot(shot: Shot): Promise<Loaded | null> {
  const key = `${shot.project.year}/${shot.project.id}/${shot.index}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const p = (async () => {
    try {
      const img = new Image();
      img.src = await shot.project.images[shot.index]();
      await img.decode();
      return { img, shot };
    } catch {
      return null;
    }
  })();
  cache.set(key, p);
  while (cache.size > CAP) cache.delete(cache.keys().next().value!);
  return p;
}
