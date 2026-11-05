import { Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  ChevronDown,
  FilePlus,
  LayoutGrid,
  RotateCcw,
  Save,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { defaultsOf, fit } from '@/lab/controls';
import { WORKS, workOf } from '@/works';
import ArtworkPlayer from './ArtworkPlayer';
import type { Compositor } from './compositor';
import {
  DOC_VERSION,
  SLUG,
  boundsOf,
  DEFAULT_EXPORTS,
  fillsOf,
  filtersOf,
  shadowsOf,
  strokesOf,
  fullFrame,
  groupLayers,
  layerId,
  newArtwork,
  newFill,
  remap,
  tidyGroups,
  ungroupLayers,
  upgrade,
  upgradeLayer,
  type Artwork,
  type Frame,
  type FillDoc,
  type LayerDoc,
  type StrokeDoc,
} from './document';
import FrameHandles from './FrameHandles';
import { ExportSection } from './Appearance';
import { download, exportName, renderArtwork } from './exporter';
import Inspector, { SelectionInspector } from './Inspector';
import LayerList from './LayerList';
import { layerTypesFor } from './registry';
import type { ShapeDoc } from './shape';
import ShapeOverlay from './ShapeOverlay';
import {
  artworkSchema,
  brushSchema,
  combineSchema,
  edgeSchema,
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
  IconButton,
  Labeled,
  Section,
  TextArea,
  TextField,
} from './ui';
import './studio.css';

const SHAPE_NAMES: Partial<Record<Tool, string>> = {
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  triangle: 'Triangle',
  polygon: 'Polygon',
  star: 'Star',
  pen: 'Drawing',
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
  const [sel, setSel] = useState<string[]>(() =>
    doc.layers.slice(-1).map((l) => l.id),
  );
  const selected = sel.at(-1) ?? null;
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
    const kept = sel.filter((id) => next.layers.some((l) => l.id === id));
    setSel(kept.length ? kept : next.layers.slice(-1).map((l) => l.id));
  };

  const group = () => {
    if (!sel.length) return;
    const n = (doc.groups?.length ?? 0) + 1;
    setDoc((d) => groupLayers(d, sel, `Folder ${n}`));
  };
  const ungroup = () => setDoc((d) => ungroupLayers(d, sel));

  const picked = doc.layers.filter((l) => sel.includes(l.id));
  const layer = picked.length === 1 ? picked[0] : null;
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
  const box = boundsOf(picked.map((l) => l.frame));
  const setBox = (to: Frame) => {
    if (!box) return;
    patchMany(sel, (l) => ({ frame: remap(l.frame, box, to) }));
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
      frame: shape?.frame ?? fullFrame(),
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
  const moveTo = (ids: string[], index: number, group?: string) =>
    setDoc((d) => {
      const set = new Set(ids);
      const block = d.layers
        .filter((l) => set.has(l.id))
        .map((l) => ({ ...l, group }));
      const below = d.layers
        .slice(0, index)
        .filter((l) => !set.has(l.id)).length;
      const layers = d.layers.filter((l) => !set.has(l.id));
      layers.splice(below, 0, ...block);
      return tidyGroups({ ...d, layers });
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
    const ix = sel
      .map((id) => ls.findIndex((l) => l.id === id))
      .filter((i) => i >= 0);
    if (!ix.length) return;
    const gs = new Set(sel.map((id) => ls.find((l) => l.id === id)?.group));
    const g = gs.size === 1 ? [...gs][0] : undefined;
    const lo = Math.min(...ix);
    const hi = Math.max(...ix);
    const span = g
      ? ls.flatMap((l, i) => (l.group === g ? i : []))
      : [0, ls.length - 1];
    const min = Math.min(...span);
    const max = Math.max(...span);
    let index: number;
    if (far) index = dir > 0 ? max + 1 : min;
    else if (dir > 0) {
      if (hi >= max) return;
      const next = ls[hi + 1];
      index =
        next.group && next.group !== g
          ? Math.max(
              ...ls.flatMap((l, i) => (l.group === next.group ? i : [])),
            ) + 1
          : hi + 2;
    } else {
      if (lo <= min) return;
      const prev = ls[lo - 1];
      index =
        prev.group && prev.group !== g
          ? Math.min(...ls.flatMap((l, i) => (l.group === prev.group ? i : [])))
          : lo - 1;
    }
    moveTo(sel, index, g);
  };

  // Copies of `src` with fresh ids, placed above the topmost selected layer
  // (or on top), in its folder, and selected.
  const clip = useRef<LayerDoc[]>([]);
  const paste = (src: LayerDoc[]) => {
    if (!src.length) return;
    const copies = src.map((l) => ({ ...structuredClone(l), id: layerId() }));
    setDoc((d) => {
      const ix = sel.map((id) => d.layers.findIndex((l) => l.id === id));
      const top = ix.length ? Math.max(...ix) : d.layers.length - 1;
      const group = d.layers[top]?.group;
      const layers = [...d.layers];
      layers.splice(top + 1, 0, ...copies.map((c) => ({ ...c, group })));
      return tidyGroups({ ...d, layers });
    });
    setSel(copies.map((c) => c.id));
  };

  const nudge = (dx: number, dy: number) =>
    patchMany(sel, (l) => ({
      frame: { ...l.frame, x: l.frame.x + dx, y: l.frame.y + dy },
    }));

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
                shadows: shadowsOf(l).map((sh) => ({
                  ...sh,
                  ...defaultsOf(shadowSchema),
                  ...fit(sh, shadowSchema),
                })),
              };
              if (l.edge)
                out.edge = {
                  ...defaultsOf(edgeSchema),
                  ...fit(l.edge, edgeSchema),
                };
              if (l.combine) {
                const s = combineSchema(l, doc.layers);
                out.combine = { ...defaultsOf(s), ...fit(l.combine, s) };
              }
              return out;
            }),
          },
          thumb: comp.current?.snapshot(800),
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
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
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
        if (k === 'h' && e.shiftKey && picked.length) {
          const show = picked.some((l) => !l.visible);
          return run(() => patchMany(sel, () => ({ visible: show })));
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
      if ((e.key === 'Backspace' || e.key === 'Delete') && tool !== 'edit')
        return run(() => removeMany(sel));
      const hit = TOOLS.flat().find((x) => x.key === k);
      if (hit && !e.shiftKey) setTool(hit.tool);
      if (e.key === 'Escape') {
        if (tool === 'select') setSelected(null);
        else setTool('select');
      }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });

  return (
    <div className="studio fixed inset-0 grid grid-cols-[16rem_2.75rem_minmax(0,1fr)_17.5rem] bg-neutral-50 text-[11px] text-neutral-800 select-none">
      <aside className="flex min-h-0 flex-col border-r border-black/8">
        <header className="flex h-11 shrink-0 items-center gap-0.5 border-b border-black/6 pr-1.5 pl-1.5">
          <Link
            to="/"
            title="Back to the site"
            className="grid size-6 shrink-0 place-items-center rounded-md text-neutral-500 hover:bg-black/5 hover:text-neutral-900"
          >
            <ArrowLeft size={13} />
          </Link>
          <span className="relative flex min-w-0 flex-1 items-center rounded-md hover:bg-black/5">
            <select
              value={work ?? ''}
              onChange={(e) => open(e.target.value)}
              title="Open a work"
              className="h-6 w-full min-w-0 cursor-pointer appearance-none truncate bg-transparent pr-5 pl-1.5 text-[12px] font-semibold text-neutral-900 outline-none"
            >
              <option value="">Unsaved draft</option>
              {WORKS.map((w) => (
                <option key={w.slug} value={w.slug}>
                  {w.doc.title || w.slug}
                </option>
              ))}
            </select>
            <ChevronDown
              size={12}
              className="pointer-events-none absolute right-1.5 text-neutral-400"
            />
          </span>
          <IconButton title="Save" onClick={save}>
            <Save size={13} />
          </IconButton>
          <IconButton title="New artwork" onClick={startNew}>
            <FilePlus size={13} />
          </IconButton>
          {work && (
            <IconButton title="Revert to saved" onClick={revert}>
              <RotateCcw size={13} />
            </IconButton>
          )}
          <Link
            to="/works"
            title="All works"
            className="grid size-6 shrink-0 place-items-center rounded-md text-neutral-500 hover:bg-black/5 hover:text-neutral-900"
          >
            <LayoutGrid size={13} />
          </Link>
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
          onMoveTo={moveTo}
          onAdd={(t) => addLayer(t)}
        />
      </aside>

      <Toolbar
        tool={tool}
        onTool={setTool}
        onUndo={() => step(true)}
        onRedo={() => step(false)}
      />

      <main className="relative min-h-0 bg-neutral-400">
        <p className="absolute inset-x-0 bottom-0 flex h-8 items-center justify-center text-neutral-700/80">
          {TOOL_HINTS[tool]}
        </p>
        <ArtworkPlayer
          doc={doc}
          className="absolute! inset-x-8 top-8 bottom-9"
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
            onPatch={patchLayer}
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
              onShiftClick={(p) => {
                const hit = hitLayer(doc.layers, p);
                if (hit) pick([hit.id], true);
              }}
            />
          )}
        </ArtworkPlayer>
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
        {layer ? (
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
            onPatch={(p) => patchMany(sel, () => p)}
            onGroup={group}
            onRemove={() => removeMany(sel)}
          />
        ) : (
          <>
            <Section id="studio:artwork" title="Artwork">
              <Labeled label="title">
                <TextField
                  value={doc.title}
                  onChange={(title) => setDoc((d) => ({ ...d, title }))}
                />
              </Labeled>
              <Labeled label="slug">
                <TextField
                  value={doc.slug}
                  onChange={(slug) => setDoc((d) => ({ ...d, slug }))}
                />
              </Labeled>
              <div className="grid gap-1 pt-0.5">
                <span className="text-neutral-500">About</span>
                <TextArea
                  value={doc.about}
                  onChange={(about) => setDoc((d) => ({ ...d, about }))}
                />
              </div>
              <Labeled label="featured">
                <input
                  type="checkbox"
                  checked={doc.featured}
                  onChange={(e) =>
                    setDoc((d) => ({ ...d, featured: e.target.checked }))
                  }
                  className="justify-self-start accent-neutral-800"
                />
              </Labeled>
            </Section>
            <ControlGroups
              id="studio"
              closed={['Post']}
              titles={{ Artwork: 'Background', Post: 'Post processing' }}
              schema={artworkSchema}
              values={{ background: doc.background, ...doc.post }}
              onChange={(k, v) =>
                setDoc((d) =>
                  k === 'background'
                    ? { ...d, background: v as string }
                    : { ...d, post: { ...d.post, [k]: v } },
                )
              }
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
