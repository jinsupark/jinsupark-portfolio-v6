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
  NO_FX,
  SLUG,
  fullFrame,
  layerId,
  newArtwork,
  type Artwork,
  type LayerDoc,
} from './document';
import FrameHandles from './FrameHandles';
import Inspector from './Inspector';
import LayerList from './LayerList';
import { layerTypesFor } from './registry';
import type { ShapeDoc } from './shape';
import ShapeOverlay from './ShapeOverlay';
import {
  artworkSchema,
  brushSchema,
  combineSchema,
  edgeSchema,
} from './studioSchemas';
import Toolbar from './Toolbar';
import { TOOL_HINTS, TOOLS, typing, type Brush, type Tool } from './tools';
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
    if (d?.version === DOC_VERSION) return d;
  } catch {
    // A broken draft just means starting from the saved file.
  }
  const saved = work && workOf(work);
  return saved ? structuredClone(saved.doc) : newArtwork();
}

// Compose experiments as layers into one artwork, and save it to
// `src/works/<slug>/`. Dev only: saving writes into the repo.
export default function Studio({ work }: { work?: string }) {
  const navigate = useNavigate();
  const [doc, setDoc] = useState(() => initialDoc(work));
  const [selected, setSelected] = useState<string | null>(
    () => doc.layers.at(-1)?.id ?? null,
  );
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
    if (!next.layers.some((l) => l.id === selected))
      setSelected(next.layers.at(-1)?.id ?? null);
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        step(!e.shiftKey);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const hit = TOOLS.flat().find((x) => x.key === e.key.toLowerCase());
      if (hit) setTool(hit.tool);
      if (e.key === 'Escape') {
        if (tool === 'select') setSelected(null);
        else setTool('select');
      }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });

  const layer = doc.layers.find((l) => l.id === selected) ?? null;
  const patchLayer = (id: string, patch: Partial<LayerDoc>) =>
    setDoc((d) => ({
      ...d,
      layers: d.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));

  const addLayer = (
    type: string,
    shape?: { frame: LayerDoc['frame']; shape: ShapeDoc; name: string },
  ) => {
    const t = types[type];
    if (!t) return;
    const l: LayerDoc = {
      id: layerId(),
      type,
      version: t.version,
      name: shape?.name ?? t.label,
      visible: true,
      frame: shape?.frame ?? fullFrame(),
      opacity: 1,
      blend: 'normal',
      mask: { source: null, mode: 'alpha', invert: false },
      fx: { ...NO_FX },
      values: { ...t.initial() },
      ...(shape && { shape: shape.shape }),
    };
    setDoc((d) => {
      const at = d.layers.findIndex((x) => x.id === selected);
      const layers = [...d.layers];
      layers.splice(at < 0 ? layers.length : at + 1, 0, l);
      return { ...d, layers };
    });
    setSelected(l.id);
  };

  // `index` is the layer's place in document order, bottom to top.
  const moveTo = (id: string, index: number) =>
    setDoc((d) => {
      const i = d.layers.findIndex((l) => l.id === id);
      if (i < 0 || i === index) return d;
      const layers = [...d.layers];
      const [l] = layers.splice(i, 1);
      layers.splice(Math.max(0, Math.min(layers.length, index)), 0, l);
      return { ...d, layers };
    });

  const remove = (id: string) => {
    setDoc((d) => ({
      ...d,
      layers: d.layers
        .filter((l) => l.id !== id)
        .map((l) =>
          l.mask.source === id
            ? { ...l, mask: { ...l.mask, source: null } }
            : l,
        ),
    }));
    if (selected === id) setSelected(null);
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
            layers: doc.layers.map((l) => {
              const t = types[l.type];
              if (!t) return l;
              const values = {
                ...defaultsOf(t.schema),
                ...fit(l.values, t.schema),
              };
              const out: LayerDoc = { ...l, version: t.version, values };
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
          types={types}
          selected={selected}
          onSelect={setSelected}
          onPatch={patchLayer}
          onMoveTo={moveTo}
          onRemove={remove}
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
            onSelect={setSelected}
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
          {layer && tool === 'select' && (
            <FrameHandles
              frame={layer.frame}
              onChange={(frame) => patchLayer(layer.id, { frame })}
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
            onRemove={remove}
            onTool={setTool}
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
              <Labeled label="featured on home">
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
          </>
        )}
      </aside>
    </div>
  );
}
