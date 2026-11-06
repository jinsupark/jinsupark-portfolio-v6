import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { defaultsOf, fit } from '@/lab/controls';
import { WORKS, workOf } from '@/works';
import ArtworkPlayer from './ArtworkPlayer';
import ArtworkTitle from './ArtworkTitle';
import type { Compositor } from './compositor';
import {
  DOC_VERSION,
  SLUG,
  ASPECTS,
  boundsOf,
  chainOf,
  folderKey,
  isFolderKey,
  layersOf,
  DEFAULT_EXPORTS,
  fillsOf,
  filtersOf,
  outlineOf,
  shadowsOf,
  strokesOf,
  fullFrame,
  groupLayers,
  layerId,
  newArtwork,
  newFill,
  remap,
  resizeArtwork,
  sizeOf,
  tidyGroups,
  ungroupLayers,
  upgrade,
  upgradeLayer,
  type Artwork,
  type Frame,
  type FillDoc,
  type GroupDoc,
  type LayerDoc,
  type StrokeDoc,
} from './document';
import FrameHandles from './FrameHandles';
import { ExportSection } from './Appearance';
import { download, exportName, renderArtwork } from './exporter';
import Inspector, { FolderInspector, SelectionInspector } from './Inspector';
import LayerList from './LayerList';
import { layerTypesFor } from './registry';
import type { ShapeDoc } from './shape';
import ShapeOverlay from './ShapeOverlay';
import {
  artworkSchema,
  brushSchema,
  combineSchema,
  OUTLINES,
  FILTERS,
  shadowSchema,
  strokeSchema,
} from './studioSchemas';
import Toolbar from './Toolbar';
import {
  hitLayer,
  TOOL_HINTS,
  TOOLS,
  typing,
  type Brush,
  type Tool,
} from './tools';
import {
  ControlGroups,
  Labeled,
  NumberField,
  PanelHeader,
  ResizeHandle,
  SelectField,
  Section,
} from './ui';
import './studio.css';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// Line the selected layers' boxes up on the selection's box, or spread them
// so the gaps between them are equal. Locked layers stay put.
function alignLayers(layers: LayerDoc[], ids: string[], how: string) {
  const moving = layers.filter((l) => ids.includes(l.id) && !l.locked);
  const box = boundsOf(moving.map((l) => l.frame));
  if (!box || moving.length < 2) return layers;
  const next = new Map<string, Frame>();
  if (how === 'hspace' || how === 'vspace') {
    const x = how === 'hspace';
    const sorted = [...moving].sort((a, b) =>
      x ? a.frame.x - b.frame.x : a.frame.y - b.frame.y,
    );
    const total = sorted.reduce((t, l) => t + (x ? l.frame.w : l.frame.h), 0);
    const gap = ((x ? box.w : box.h) - total) / (sorted.length - 1);
    let at = x ? box.x : box.y;
    for (const l of sorted) {
      next.set(l.id, { ...l.frame, [x ? 'x' : 'y']: Math.round(at) });
      at += (x ? l.frame.w : l.frame.h) + gap;
    }
  } else
    for (const l of moving) {
      const f = l.frame;
      const pos: Partial<Frame> =
        {
          left: { x: box.x },
          hcenter: { x: box.x + (box.w - f.w) / 2 },
          right: { x: box.x + box.w - f.w },
          top: { y: box.y },
          vcenter: { y: box.y + (box.h - f.h) / 2 },
          bottom: { y: box.y + box.h - f.h },
        }[how] ?? {};
      next.set(l.id, { ...f, ...pos });
    }
  return layers.map((l) =>
    next.has(l.id) ? { ...l, frame: next.get(l.id)! } : l,
  );
}

const SHAPE_NAMES: Partial<Record<Tool, string>> = {
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  triangle: 'Triangle',
  polygon: 'Polygon',
  star: 'Star',
  pen: 'Drawing',
  bezier: 'Path',
};

// Edits closer together than this are one step of undo, so a drag is one.
const COALESCE_MS = 400;

// Unsaved edits survive a reload: one draft per opened work, plus one for a
// work that hasn't been saved yet.
const draftKey = (work?: string) => `studio:draft:${work ?? ''}`;

function initialDoc(work?: string): Artwork {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey(work)) ?? 'null');
    if (d?.version === DOC_VERSION) return upgrade(d);
  } catch {
    // A broken draft just means starting from the saved file.
  }
  const saved = work && workOf(work);
  return saved ? upgrade(structuredClone(saved.doc)) : newArtwork();
}

// Compose experiments as layers into one artwork, and save it to
// `src/works/<slug>/`. Dev only: saving writes into the repo.
export default function Studio({ work }: { work?: string }) {
  const navigate = useNavigate();
  const [doc, setDoc] = useState(() => initialDoc(work));
  // The selected layers in the order they were picked; the last is the one
  // the inspector and the point tools work on.
  // Starts on the topmost layer you can edit (not a locked one).
  const [sel, setSel] = useState<string[]>(() =>
    doc.layers
      .filter((l) => !l.locked)
      .slice(-1)
      .map((l) => l.id),
  );
  const selected = sel.at(-1) ?? null;
  // The layer the pointer is over in the layer list, outlined on the canvas.
  const [hovered, setHovered] = useState<string | null>(null);
  const setSelected = (id: string | null) => setSel(id ? [id] : []);
  // Shift-click: add a layer to the selection, or take it out.
  const pick = (ids: string[], additive: boolean) =>
    setSel((s) => {
      if (!additive) return ids;
      const all = ids.every((id) => s.includes(id));
      return all
        ? s.filter((id) => !ids.includes(id))
        : [...s.filter((id) => !ids.includes(id)), ...ids];
    });
  const [status, setStatus] = useState('');
  // The sidebars' widths, dragged at their inner edges and remembered.
  const [widths, setWidths] = useState<{ left: number; right: number }>(() => {
    try {
      const w = JSON.parse(localStorage.getItem('studio:widths') ?? 'null');
      if (typeof w?.left === 'number' && typeof w?.right === 'number') return w;
    } catch {
      // Fall through to the defaults.
    }
    return { left: 256, right: 280 };
  });
  const saveWidths = () =>
    setWidths((w) => {
      localStorage.setItem('studio:widths', JSON.stringify(w));
      return w;
    });
  const size = sizeOf(doc);
  const comp = useRef<Compositor | null>(null);
  const types = useMemo(() => layerTypesFor(doc.slug), [doc.slug]);

  const [tool, setTool] = useState<Tool>('select');
  const [brush, setBrush] = useState<Brush>({ size: 60, strength: 0.8 });

  useEffect(() => {
    localStorage.setItem(draftKey(work), JSON.stringify(doc));
  }, [doc, work]);

  const hist = useRef({
    past: [] as Artwork[],
    future: [] as Artwork[],
    prev: null as Artwork | null,
    at: 0,
    replaying: false,
  });
  useEffect(() => {
    const h = hist.current;
    if (h.replaying) h.replaying = false;
    else if (h.prev && h.prev !== doc) {
      const now = performance.now();
      if (now - h.at > COALESCE_MS) {
        h.past.push(h.prev);
        if (h.past.length > 200) h.past.shift();
      }
      h.future = [];
      h.at = now;
    }
    h.prev = doc;
  }, [doc]);
  const step = (back: boolean) => {
    const h = hist.current;
    const next = (back ? h.past : h.future).pop();
    if (!next || !h.prev) return;
    (back ? h.future : h.past).push(h.prev);
    h.replaying = true;
    h.at = 0;
    setDoc(next);
    const kept = sel.filter((id) =>
      isFolderKey(id)
        ? next.groups?.some((g) => folderKey(g.id) === id)
        : next.layers.some((l) => l.id === id),
    );
    setSel(kept.length ? kept : next.layers.slice(-1).map((l) => l.id));
  };

  const group = () => {
    if (!sel.length) return;
    const n = (doc.groups?.length ?? 0) + 1;
    setDoc((d) => groupLayers(d, sel, `Folder ${n}`));
  };
  const ungroup = () => setDoc((d) => ungroupLayers(d, sel));

  // The selection's layers: a selected folder stands for every layer in it.
  const ids = layersOf(doc, sel);
  const picked = doc.layers.filter((l) => ids.includes(l.id));
  const folder =
    sel.length === 1 && isFolderKey(sel[0])
      ? (doc.groups?.find((g) => folderKey(g.id) === sel[0]) ?? null)
      : null;
  const layer = !folder && picked.length === 1 ? picked[0] : null;
  const patchFolder = (id: string, patch: Partial<GroupDoc>) =>
    setDoc((d) => ({
      ...d,
      groups: d.groups?.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    }));
  const patchLayer = (id: string, patch: Partial<LayerDoc>) =>
    setDoc((d) => ({
      ...d,
      layers: d.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  const patchMany = (
    ids: string[],
    patch: (l: LayerDoc) => Partial<LayerDoc>,
  ) =>
    setDoc((d) => ({
      ...d,
      layers: d.layers.map((l) =>
        ids.includes(l.id) ? { ...l, ...patch(l) } : l,
      ),
    }));
  // The selection's box. Setting it carries every selected frame along.
  const box = boundsOf(picked.filter((l) => !l.locked).map((l) => l.frame));
  const setBox = (to: Frame) => {
    if (!box) return;
    patchMany(ids, (l) => ({ frame: remap(l.frame, box, to) }));
  };

  const addLayer = (
    type: string,
    shape?: { frame: LayerDoc['frame']; shape: ShapeDoc; name: string },
  ) => {
    const t = types[type];
    if (!t) return;
    const l: LayerDoc = {
      id: layerId(),
      name: shape?.name ?? t.label,
      visible: true,
      frame: shape?.frame ?? fullFrame(size),
      opacity: 1,
      blend: 'normal',
      mask: { source: null, mode: 'alpha', invert: false },
      fills: [newFill(type, { ...t.initial() }, t.version)],
      ...(shape && { shape: shape.shape }),
    };
    setDoc((d) => {
      const at = d.layers.findIndex((x) => x.id === selected);
      const layers = [...d.layers];
      // A new layer lands above the selected one, inside its folder.
      const group = at >= 0 ? layers[at].group : undefined;
      layers.splice(at < 0 ? layers.length : at + 1, 0, { ...l, group });
      return { ...d, layers };
    });
    setSelected(l.id);
  };

  // Move a block of layers so it lands before document index `index` (bottom
  // to top, counted before the block is taken out), joining folder `group`.
  // A whole folder (`folder`) keeps its layers' places in it and moves into
  // `group` itself.
  const moveTo = (
    ids: string[],
    index: number,
    group?: string,
    folder?: string,
  ) =>
    setDoc((d) => {
      const set = new Set(ids);
      const block = d.layers
        .filter((l) => set.has(l.id))
        .map((l) => (folder ? l : { ...l, group }));
      const groups = folder
        ? d.groups?.map((g) => (g.id === folder ? { ...g, parent: group } : g))
        : d.groups;
      const below = d.layers
        .slice(0, index)
        .filter((l) => !set.has(l.id)).length;
      const layers = d.layers.filter((l) => !set.has(l.id));
      layers.splice(below, 0, ...block);
      return tidyGroups({ ...d, layers, groups });
    });

  const removeMany = (ids: string[]) => {
    setDoc((d) =>
      tidyGroups({
        ...d,
        layers: d.layers
          .filter((l) => !ids.includes(l.id))
          .map((l) =>
            l.mask.source && ids.includes(l.mask.source)
              ? { ...l, mask: { ...l.mask, source: null } }
              : l,
          ),
      }),
    );
    setSel((s) => s.filter((id) => !ids.includes(id)));
  };

  // Restack the selection: one step up or down (`dir`), or to the end of its
  // range (`far`). Inside a folder that range is the folder, and a step past
  // another folder hops the whole of it, so folders stay in one piece.
  const restack = (dir: 1 | -1, far: boolean) => {
    const ls = doc.layers;
    const ix = ids
      .map((id) => ls.findIndex((l) => l.id === id))
      .filter((i) => i >= 0);
    if (!ix.length) return;
    // The folder the move happens inside: a selected folder's parent, or the
    // folder the selected layers share.
    const gs = new Set(
      folder
        ? [folder.parent]
        : ids.map((id) => ls.find((l) => l.id === id)?.group),
    );
    const g = gs.size === 1 ? [...gs][0] : undefined;
    const indices = (gid: string) =>
      ls.flatMap((l, i) =>
        chainOf(doc, l).some((c) => c.id === gid) ? i : [],
      );
    // A neighbour moves past as one piece: itself, or the whole folder it's in
    // just under `g`.
    const unit = (i: number) => {
      const chain = chainOf(doc, ls[i]);
      const at = g ? chain.findIndex((c) => c.id === g) + 1 : 0;
      return chain[at] ? indices(chain[at].id) : [i];
    };
    const lo = Math.min(...ix);
    const hi = Math.max(...ix);
    const span = g ? indices(g) : [0, ls.length - 1];
    const min = Math.min(...span);
    const max = Math.max(...span);
    let index: number;
    if (far) index = dir > 0 ? max + 1 : min;
    else if (dir > 0) {
      if (hi >= max) return;
      index = Math.max(...unit(hi + 1)) + 1;
    } else {
      if (lo <= min) return;
      index = Math.min(...unit(lo - 1));
    }
    moveTo(ids, index, g, folder?.id);
  };

  // Copies of `src` with fresh ids, placed above the topmost selected layer
  // (or on top), in its folder, and selected.
  const clip = useRef<LayerDoc[]>([]);
  const paste = (src: LayerDoc[]) => {
    if (!src.length) return;
    const copies = src.map((l) => ({ ...structuredClone(l), id: layerId() }));
    setDoc((d) => {
      const ix = ids.map((id) => d.layers.findIndex((l) => l.id === id));
      const top = ix.length ? Math.max(...ix) : d.layers.length - 1;
      const group = d.layers[top]?.group;
      const layers = [...d.layers];
      layers.splice(top + 1, 0, ...copies.map((c) => ({ ...c, group })));
      return tidyGroups({ ...d, layers });
    });
    setSel(copies.map((c) => c.id));
  };

  // A copy of one layer just above it, selected; its id, so a drag can carry it.
  const duplicateOne = (id: string) => {
    const src = doc.layers.find((l) => l.id === id);
    if (!src) return id;
    const copy = { ...structuredClone(src), id: layerId() };
    setDoc((d) => {
      const layers = [...d.layers];
      layers.splice(layers.findIndex((l) => l.id === id) + 1, 0, copy);
      return { ...d, layers };
    });
    setSel([copy.id]);
    return copy.id;
  };

  const nudge = (dx: number, dy: number) =>
    patchMany(ids, (l) =>
      l.locked
        ? {}
        : { frame: { ...l.frame, x: l.frame.x + dx, y: l.frame.y + dy } },
    );

  // The saved thumbnail: the whole artwork, rendered offscreen so it doesn't
  // depend on where the canvas is panned or zoomed.
  const thumbOf = async (d: Artwork) => {
    const blob = await renderArtwork(d, types, {
      id: 'thumb',
      scale: 1,
      format: 'jpg',
    });
    return await new Promise<string>((ok) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result));
      r.readAsDataURL(blob);
    });
  };

  const [exporting, setExporting] = useState(false);
  const exportAll = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      for (const e of doc.exports ?? DEFAULT_EXPORTS) {
        const blob = await renderArtwork(doc, types, e);
        download(blob, exportName(doc, e));
      }
      setStatus('exported');
    } catch (err) {
      setStatus(`export failed: ${String(err)}`);
    } finally {
      setExporting(false);
    }
  };

  const fullFill = (f: FillDoc): FillDoc => {
    const t = types[f.type];
    return t
      ? {
          ...f,
          version: t.version,
          values: { ...defaultsOf(t.schema), ...fit(f.values, t.schema) },
        }
      : f;
  };

  const save = async () => {
    if (!SLUG.test(doc.slug)) {
      setStatus('slug: lowercase letters, digits and dashes');
      return;
    }
    setStatus('saving…');
    try {
      const res = await fetch('/__lab/artwork', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: doc.slug,
          // Every value written out, so the file doesn't lean on today's
          // schema defaults to mean what it meant when it was saved.
          artwork: {
            ...doc,
            layers: doc.layers.map((layer) => {
              const l = upgradeLayer(layer);
              const out: LayerDoc = {
                ...l,
                fills: fillsOf(l).map(fullFill),
                filters: filtersOf(l).map((f) => {
                  const schema = FILTERS[f.type]?.schema;
                  return schema
                    ? {
                        ...f,
                        values: {
                          ...defaultsOf(schema),
                          ...fit(f.values, schema),
                        },
                      }
                    : f;
                }),
                strokes: strokesOf(l).map((st): StrokeDoc => ({
                  ...st,
                  ...(defaultsOf(strokeSchema) as Partial<StrokeDoc>),
                  ...(fit(st, strokeSchema) as Partial<StrokeDoc>),
                  fills: st.fills.map(fullFill),
                })),
                outline: outlineOf(l).map((o) => {
                  const schema = OUTLINES[o.type]?.schema;
                  return schema
                    ? {
                        ...o,
                        values: {
                          ...defaultsOf(schema),
                          ...fit(o.values, schema),
                        },
                      }
                    : o;
                }),
                shadows: shadowsOf(l).map((sh) => ({
                  ...sh,
                  ...defaultsOf(shadowSchema),
                  ...fit(sh, shadowSchema),
                })),
              };
              if (l.combine) {
                const s = combineSchema(l, doc.layers);
                out.combine = { ...defaultsOf(s), ...fit(l.combine, s) };
              }
              return out;
            }),
          },
          thumb: await thumbOf(doc),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setStatus(`saved to src/works/${doc.slug}/`);
      if (work !== doc.slug) {
        localStorage.setItem(draftKey(doc.slug), JSON.stringify(doc));
        localStorage.removeItem(draftKey(work));
        open(doc.slug);
      }
    } catch (e) {
      setStatus(`save failed: ${String(e)}`);
    }
  };

  // The route keys the studio on `work`, so navigating reloads the document.
  const open = (slug: string) =>
    void navigate({ to: '/studio', search: slug ? { work: slug } : {} });
  const startNew = () => {
    localStorage.setItem(draftKey(), JSON.stringify(newArtwork()));
    setDoc(newArtwork());
    setSelected(null);
    open('');
  };
  // Throw away unsaved edits and reload the saved file.
  const revert = () => {
    localStorage.removeItem(draftKey(work));
    const next = initialDoc(work);
    setDoc(next);
    setSelected(next.layers.at(-1)?.id ?? null);
  };

  // Shortcuts, the basic Figma and Paper ones.
  const stepLatest = useRef(step);
  useEffect(() => {
    stepLatest.current = step;
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      // ⌘Z in a value box (number, hex) undoes the document, as everywhere
      // else: the box commits and lets go first, then the step happens once
      // that edit has landed in the history.
      const t = e.target as HTMLElement | null;
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === 'z' &&
        t?.closest?.('[data-value-field]')
      ) {
        e.preventDefault();
        t.blur();
        const back = !e.shiftKey;
        setTimeout(() => stepLatest.current(back), 30);
        return;
      }
      if (typing(e) || e.defaultPrevented) return;
      const cmd = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      const run = (f: () => void) => {
        e.preventDefault();
        f();
      };
      if (cmd) {
        if (k === 'z') return run(() => step(!e.shiftKey));
        if (k === 'g') return run(e.shiftKey ? ungroup : group);
        if (k === 's') return run(() => void save());
        if (k === 'e' && e.shiftKey) return run(() => void exportAll());
        if (k === 'a') return run(() => setSel(doc.layers.map((l) => l.id)));
        if (k === 'd') return run(() => paste(picked));
        if (k === 'c' && picked.length)
          return run(() => (clip.current = picked));
        if (k === 'v') return run(() => paste(clip.current));
        if (k === 'l' && e.shiftKey && picked.length) {
          const lock = picked.some((l) => !l.locked);
          return run(() => patchMany(ids, () => ({ locked: lock })));
        }
        if (k === 'h' && e.shiftKey && picked.length) {
          const show = picked.some((l) => !l.visible);
          return run(() => patchMany(ids, () => ({ visible: show })));
        }
        if (e.code === 'BracketRight') return run(() => restack(1, false));
        if (e.code === 'BracketLeft') return run(() => restack(-1, false));
        return;
      }
      if (e.altKey) return;
      if (e.code === 'BracketRight') return run(() => restack(1, true));
      if (e.code === 'BracketLeft') return run(() => restack(-1, true));
      if (e.key.startsWith('Arrow') && sel.length && tool === 'select') {
        const n = e.shiftKey ? 10 : 1;
        const [dx, dy] = {
          ArrowLeft: [-n, 0],
          ArrowRight: [n, 0],
          ArrowUp: [0, -n],
          ArrowDown: [0, n],
        }[e.key] ?? [0, 0];
        return run(() => nudge(dx, dy));
      }
      // Enter on a selected shape edits its points, as in Figma; Esc leaves.
      if (e.key === 'Enter' && tool === 'select' && layer && !layer.locked)
        return run(() => setTool('edit'));
      if ((e.key === 'Backspace' || e.key === 'Delete') && tool !== 'edit')
        return run(() => removeMany(ids));
      const hit = TOOLS.flat().find(
        (x) => x.key === (e.shiftKey ? `⇧${k}` : k),
      );
      if (hit) setTool(hit.tool);
      if (e.key === 'Escape') {
        if (tool === 'select') setSelected(null);
        else setTool('select');
      }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });

  return (
    <div
      className="studio fixed inset-0 grid bg-neutral-50 text-[11px] text-neutral-800 select-none"
      style={{
        gridTemplateColumns: `${widths.left}px 2.75rem minmax(0,1fr) ${widths.right}px`,
      }}
    >
      <ResizeHandle
        side="left"
        edge={widths.left}
        min={200}
        max={480}
        onResize={(left) => setWidths((w) => ({ ...w, left }))}
        onDone={saveWidths}
      />
      <ResizeHandle
        side="right"
        edge={widths.right}
        min={240}
        max={560}
        onResize={(right) => setWidths((w) => ({ ...w, right }))}
        onDone={saveWidths}
      />
      <aside className="flex min-h-0 flex-col border-r border-black/8">
        <header className="flex h-11 shrink-0 items-center gap-0.5 border-b border-black/6 pr-1.5 pl-1.5">
          <Link
            to="/"
            title="Back to the site"
            className="grid size-6 shrink-0 place-items-center rounded-md text-neutral-500 hover:bg-black/5 hover:text-neutral-900"
          >
            <ArrowLeft size={13} />
          </Link>
          <ArtworkTitle
            title={doc.title}
            slug={doc.slug}
            featured={doc.featured}
            current={work ?? ''}
            works={WORKS.map((w) => ({ slug: w.slug, title: w.doc.title }))}
            onRename={(title) =>
              setDoc((d) => ({
                ...d,
                title,
                // An unsaved artwork's slug follows its name; a saved one
                // keeps its folder.
                ...(!work && { slug: slugify(title) || d.slug }),
              }))
            }
            onSlug={(slug) => setDoc((d) => ({ ...d, slug }))}
            onFeatured={(featured) => setDoc((d) => ({ ...d, featured }))}
            onOpen={open}
            onNew={startNew}
            onSave={() => void save()}
            onRevert={work ? revert : undefined}
          />
        </header>
        {status && (
          <p className="shrink-0 border-b border-black/6 px-3 py-2 text-neutral-500">
            {status}
          </p>
        )}

        <LayerList
          layers={doc.layers}
          groups={doc.groups ?? []}
          types={types}
          selection={sel}
          onSelect={pick}
          onPatch={patchLayer}
          onPatchMany={patchMany}
          onRenameGroup={(id, name) =>
            setDoc((d) => ({
              ...d,
              groups: d.groups?.map((g) => (g.id === id ? { ...g, name } : g)),
            }))
          }
          onPatchGroup={patchFolder}
          onMoveTo={moveTo}
          onHover={setHovered}
        />
      </aside>

      <Toolbar tool={tool} onTool={setTool} />

      <main
        className="relative min-h-0"
        style={{ background: doc.surround ?? '#eeeeee' }}
      >
        <ArtworkPlayer
          doc={doc}
          navigable
          surround={doc.surround ?? '#eeeeee'}
          className="absolute! inset-0"
          onCompositor={(c) => (comp.current = c)}
          onBackdrop={() => setSelected(null)}
        >
          <ShapeOverlay
            tool={tool}
            layers={doc.layers}
            layer={layer}
            brush={brush}
            onSelect={(id, add) =>
              add ? id && pick([id], true) : setSelected(id)
            }
            selection={sel}
            hovered={hovered}
            onSelectMany={(ids, add) =>
              add
                ? setSel((s) => [...s.filter((x) => !ids.includes(x)), ...ids])
                : setSel(ids)
            }
            onPatch={patchLayer}
            onDuplicate={duplicateOne}
            onDone={() => setTool('select')}
            size={size}
            onCreate={(t, frame, shape) => {
              addLayer('solid', {
                frame,
                shape,
                name: SHAPE_NAMES[t] ?? 'Shape',
              });
              setTool('select');
            }}
          />
          {box && tool === 'select' && (
            <FrameHandles
              frame={layer ? layer.frame : box}
              onChange={(frame) =>
                layer ? patchLayer(layer.id, { frame }) : setBox(frame)
              }
              size={size}
              rotatable={!!layer && !layer.locked}
              onDuplicate={() => paste(picked)}
              onShiftClick={(p) => {
                const hit = hitLayer(doc.layers, p);
                if (hit) pick([hit.id], true);
              }}
            />
          )}
        </ArtworkPlayer>
        <p className="pointer-events-none absolute inset-x-0 bottom-0 flex h-8 items-center justify-center text-neutral-700/80">
          {TOOL_HINTS[tool]}
        </p>
      </main>

      <aside className="flex min-h-0 flex-col overflow-y-auto border-l border-black/8">
        {tool === 'smear' && (
          <ControlGroups
            id="studio"
            schema={brushSchema}
            values={brush}
            onChange={(k, v) => setBrush((b) => ({ ...b, [k]: v }))}
          />
        )}
        {folder ? (
          <FolderInspector
            key={folder.id}
            folder={folder}
            layers={doc.layers}
            box={box}
            onBox={setBox}
            onPatch={(p) => patchFolder(folder.id, p)}
          />
        ) : layer ? (
          <Inspector
            key={layer.id}
            layer={layer}
            layers={doc.layers}
            types={types}
            onPatch={patchLayer}
          />
        ) : box ? (
          <SelectionInspector
            layers={picked}
            box={box}
            onBox={setBox}
            onPatch={(p) => patchMany(ids, () => p)}
            onAlign={(how) =>
              setDoc((d) => ({
                ...d,
                layers: alignLayers(d.layers, ids, how),
              }))
            }
            onMask={() => {
              // Like Figma: the bottom layer's pixels mask the ones above it,
              // and it stops showing itself.
              const [bottom, ...rest] = picked;
              if (!bottom || !rest.length) return;
              patchMany(
                rest.map((l) => l.id),
                () => ({
                  mask: { source: bottom.id, mode: 'alpha', invert: false },
                }),
              );
              patchLayer(bottom.id, { visible: false });
            }}
            onBoolean={(op) => {
              // The bottom layer's shape is combined with the others' (up to
              // three), which then only serve as cutters.
              const [bottom, ...rest] = picked;
              if (!bottom || !rest.length) return;
              const used = rest.slice(0, 3);
              const combine: Record<string, unknown> = { smooth: 0 };
              used.forEach((l, i) => {
                combine[`op${i + 1}`] = op;
                combine[`with${i + 1}`] = l.id;
              });
              patchLayer(bottom.id, { combine });
              patchMany(
                used.map((l) => l.id),
                () => ({ visible: false }),
              );
              setSelected(bottom.id);
            }}
          />
        ) : (
          <>
            <PanelHeader
              title="Page"
              meta={`${ASPECTS.find((a) => a.size.w === size.w && a.size.h === size.h)?.label ?? 'Custom'} · ${size.w} × ${size.h} · ${doc.layers.length} layers`}
            />
            <Section id="studio:canvas" title="Canvas">
              <Labeled label="aspect">
                <SelectField
                  value={
                    ASPECTS.find(
                      (a) => a.size.w === size.w && a.size.h === size.h,
                    )?.label ?? 'custom'
                  }
                  options={[
                    ...ASPECTS.map((a) => ({ value: a.label, label: a.label })),
                    { value: 'custom', label: 'custom' },
                  ]}
                  onChange={(v) => {
                    const a = ASPECTS.find((x) => x.label === v);
                    if (a) setDoc((d) => resizeArtwork(d, a.size));
                  }}
                />
              </Labeled>
              <div className="grid grid-cols-2 gap-1.5">
                {(['w', 'h'] as const).map((k) => (
                  <NumberField
                    key={k}
                    value={size[k]}
                    onChange={(v) =>
                      setDoc((d) => resizeArtwork(d, { ...size, [k]: v }))
                    }
                    min={50}
                    max={4000}
                    step={1}
                    prefix={k.toUpperCase()}
                  />
                ))}
              </div>
            </Section>
            <ControlGroups
              id="studio"
              titles={{ Artwork: 'Colours' }}
              schema={artworkSchema}
              values={{
                background: doc.background,
                surround: doc.surround ?? '#eeeeee',
              }}
              onChange={(k, v) => setDoc((d) => ({ ...d, [k]: v as string }))}
            />
            <ExportSection
              exports={doc.exports ?? DEFAULT_EXPORTS}
              onExports={(exports) => setDoc((d) => ({ ...d, exports }))}
              onExport={() => void exportAll()}
              busy={exporting}
            />
          </>
        )}
      </aside>
    </div>
  );
}
