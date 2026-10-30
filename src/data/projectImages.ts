// Where the catalogue in `projects.ts` meets its imagery.
//
// `PROJECT_LIST` decides which projects exist and in what order; the asset tree
// decides what each one looks like. This file walks the list and hangs the globbed
// media off each entry, so screenshots are never listed by hand. A row with no
// files, or files with no row, warns in dev — see `checkCatalogue`.
//
//   /src/assets/projects/<year>/<id>/<id>-NN.jpg   screenshots, authored order
//   /src/assets/projects/<year>/<id>/<id>-01.mp4   a motion project's loop
//
// vite-imagetools turns each source JPEG into WebP at build time, so no
// derivatives are committed. Glob options must be static literals for the
// transform to happen at build time.

import { PROJECT_LIST, projectKey } from './projects';

// Poster size: every screenshot at 1600px WebP. Lazy, because an eager
// imagetools import has to transform the file to know its URL — eager over ~420
// screenshots is a dev server that can't serve a page until sharp has chewed
// through all of them.
const posterModules = import.meta.glob('/src/assets/projects/*/*/*.jpg', {
  query: { w: 1600, format: 'webp', quality: 82 },
  import: 'default',
}) as Record<string, () => Promise<string>>;

export type ImageLoader = () => Promise<string>;

// Untransformed (imagetools is images only).
const videoModules = import.meta.glob('/src/assets/projects/*/*/*-01.mp4', {
  import: 'default',
  eager: true,
}) as Record<string, string>;

// /src/assets/projects/<year>/<id>/<file> → `<year>/<id>`, the catalogue's key.
function keyOf(path: string): string {
  const parts = path.split('/');
  return projectKey({ year: parts[4], id: parts[5] });
}

const imagesByKey = new Map<string, ImageLoader[]>();
for (const path of Object.keys(posterModules).sort()) {
  const k = keyOf(path);
  const arr = imagesByKey.get(k) ?? [];
  arr.push(posterModules[path]);
  imagesByKey.set(k, arr);
}
const videoByKey = new Map<string, string>();
for (const path of Object.keys(videoModules)) {
  videoByKey.set(keyOf(path), videoModules[path]);
}

export interface ProjectMeta {
  id: string;
  year: string;
  name: string;
  title?: string;
  blurb?: string;
  // Every screenshot at poster size, in filename order. A motion project's first
  // entry is its poster frame, committed beside the mp4.
  images: ImageLoader[];
  video?: string;
}

// A listed project with no imagery is dropped; `checkCatalogue` says so.
export const PROJECTS: ProjectMeta[] = PROJECT_LIST.flatMap((p) => {
  const key = projectKey(p);
  const images = imagesByKey.get(key) ?? [];
  const video = videoByKey.get(key);
  if (!images.length && !video) return [];
  return [
    {
      id: p.id,
      year: p.year,
      name: p.name,
      title: p.title,
      // Most rows ship with `blurb: ''` as a place to type.
      blurb: p.blurb || undefined,
      images,
      video,
    },
  ];
});

function checkCatalogue() {
  if (!import.meta.env.DEV) return;
  const keys = PROJECT_LIST.map(projectKey);
  const listed = new Set(keys);
  const onDisk = new Set([...imagesByKey.keys(), ...videoByKey.keys()]);
  const say = (what: string, list: string[]) =>
    list.length &&
    console.warn(`[projects] ${list.length} ${what}:\n  ${list.join('\n  ')}`);

  say(
    'listed with no imagery (not shown)',
    keys.filter((k) => !onDisk.has(k)),
  );
  // Not shown, by design — the asset tree doubles as a staging area.
  say(
    'on disk but not in PROJECT_LIST (not shown)',
    [...onDisk].filter((k) => !listed.has(k)).sort(),
  );
  const seen = new Set<string>();
  say(
    'duplicated in PROJECT_LIST',
    keys.filter((k) => seen.has(k) || !seen.add(k)),
  );
}
checkCatalogue();
