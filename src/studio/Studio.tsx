import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ControlGroups, PanelButton } from '@/lab/ControlRows';
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
import { layerTypesFor } from './registry';
import type { ShapeDoc } from './shape';
import ShapeOverlay from './ShapeOverlay';
import { typing, type Brush, type Tool } from './tools';
import {
  artworkSchema,
  combineSchema,
  compositeSchema,
  edgeSchema,
  frameSchema,
  fxSchema,
  maskSchema,
  shaderSchema,
  shapeSchema,
} from './studioSchemas';

const TOOLS: { tool: Tool; key: string; label: string }[] = [
  { tool: 'select', key: 'v', label: 'Select' },
  { tool: 'rect', key: 'r', label: 'Rect' },
  { tool: 'ellipse', key: 'e', label: 'Ellipse' },
  { tool: 'triangle', key: 't', label: 'Triangle' },
  { tool: 'polygon', key: 'g', label: 'Polygon' },
  { tool: 'star', key: 'k', label: 'Star' },
  { tool: 'pen', key: 'p', label: 'Draw' },
  { tool: 'edit', key: 'a', label: 'Points' },
  { tool: 'smear', key: 's', label: 'Smear' },
];
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
      const hit = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (hit) setTool(hit.tool);
      if (e.key === 'Escape') setTool('select');
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

  const move = (id: string, by: number) =>
    setDoc((d) => {
      const i = d.layers.findIndex((l) => l.id === id);
      const j = i + by;
      if (i < 0 || j < 0 || j >= d.layers.length) return d;
      const layers = [...d.layers];
      [layers[i], layers[j]] = [layers[j], layers[i]];
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

  const type = layer ? types[layer.type] : undefined;
  const layerValues =
    layer && type
      ? { ...defaultsOf(type.schema), ...fit(layer.values, type.schema) }
      : {};
  const edgeValues: Record<string, unknown> = {
    ...defaultsOf(edgeSchema),
    ...fit(layer?.edge ?? {}, edgeSchema),
  };
  const combineValues: Record<string, unknown> = layer
    ? (() => {
        const s = combineSchema(layer, doc.layers);
        return { ...defaultsOf(s), ...fit(layer.combine ?? {}, s) };
      })()
    : {};

  return (
    <div className="fixed inset-0 grid grid-cols-[17rem_minmax(0,1fr)_19rem] bg-neutral-900 font-mono text-[10px] text-neutral-300 select-none">
      <aside className="flex min-h-0 flex-col border-r border-white/10">
        <header className="flex items-center justify-between border-b border-white/10 px-3 py-2 tracking-widest text-neutral-500 uppercase">
          <Link to="/" className="hover:text-neutral-200">
            ← Studio
          </Link>
          <Link to="/works" className="hover:text-neutral-200">
            Works
          </Link>
        </header>
        <div className="flex flex-wrap gap-1 border-b border-white/10 p-2">
          <PanelButton onClick={save}>Save</PanelButton>
          <PanelButton onClick={startNew}>New</PanelButton>
          {work && <PanelButton onClick={revert}>Revert</PanelButton>}
          <select
            value={work ?? ''}
            onChange={(e) => open(e.target.value)}
            className="rounded-sm bg-white/10 px-1 py-1 uppercase"
          >
            <option value="" className="bg-neutral-900">
              Draft
            </option>
            {WORKS.map((w) => (
              <option key={w.slug} value={w.slug} className="bg-neutral-900">
                Open {w.slug}
              </option>
            ))}
          </select>
        </div>
        {status && (
          <p className="border-b border-white/10 px-3 py-2 text-neutral-400">
            {status}
          </p>
        )}
        <div className="space-y-1.5 border-b border-white/10 px-3 py-3">
          <TextRow
            label="slug"
            value={doc.slug}
            onChange={(slug) => setDoc((d) => ({ ...d, slug }))}
          />
          <TextRow
            label="title"
            value={doc.title}
            onChange={(title) => setDoc((d) => ({ ...d, title }))}
          />
          <label className="grid gap-1">
            <span className="text-neutral-400">about</span>
            <textarea
              value={doc.about}
              rows={3}
              onChange={(e) => setDoc((d) => ({ ...d, about: e.target.value }))}
              className="resize-none rounded-sm bg-white/10 px-1.5 py-1 select-text"
            />
          </label>
          <label className="grid grid-cols-[7rem_1fr] items-center gap-2">
            <span className="text-neutral-400">featured on home</span>
            <input
              type="checkbox"
              checked={doc.featured}
              onChange={(e) =>
                setDoc((d) => ({ ...d, featured: e.target.checked }))
              }
              className="justify-self-start accent-neutral-200"
            />
          </label>
        </div>
        <div className="overflow-y-auto">
          <ControlGroups
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
          <div className="flex items-center justify-between px-3 py-2">
            <span className="tracking-widest text-neutral-100 uppercase">
              Layers
            </span>
            <select
              value=""
              onChange={(e) => addLayer(e.target.value)}
              className="rounded-sm bg-white/10 px-1 py-0.5"
            >
              <option value="" className="bg-neutral-900">
                + shader
              </option>
              {Object.entries(types).map(([id, t]) => (
                <option key={id} value={id} className="bg-neutral-900">
                  {t.label}
                  {id.startsWith('local/') ? ' (this artwork)' : ''}
                </option>
              ))}
            </select>
          </div>
          <ul className="pb-3">
            {[...doc.layers].reverse().map((l) => (
              <li
                key={l.id}
                onClick={() => setSelected(l.id)}
                className={`flex items-center gap-1 px-2 py-1 ${l.id === selected ? 'bg-white/15 text-neutral-50' : 'hover:bg-white/5'}`}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    patchLayer(l.id, { visible: !l.visible });
                  }}
                  className={`w-4 ${l.visible ? '' : 'text-neutral-600'}`}
                  title="visible"
                >
                  {l.visible ? '●' : '○'}
                </button>
                <span className="flex-1 truncate">
                  {l.name}
                  {types[l.type] ? '' : ' (missing type)'}
                </span>
                {(
                  [
                    ['↑', 1],
                    ['↓', -1],
                  ] as const
                ).map(([glyph, by]) => (
                  <button
                    key={glyph}
                    onClick={(e) => {
                      e.stopPropagation();
                      move(l.id, by);
                    }}
                    className="px-1 text-neutral-500 hover:text-neutral-100"
                  >
                    {glyph}
                  </button>
                ))}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(l.id);
                  }}
                  className="px-1 text-neutral-500 hover:text-red-300"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="relative min-h-0 bg-neutral-800">
        <div className="absolute inset-x-0 top-0 flex h-10 items-center justify-center gap-1 px-2">
          {TOOLS.map((t) => (
            <button
              key={t.tool}
              onClick={() => setTool(t.tool)}
              title={`${t.label} (${t.key.toUpperCase()})`}
              className={`rounded-sm px-2 py-1 tracking-wider uppercase ${tool === t.tool ? 'bg-sky-400/30 text-neutral-50' : 'bg-white/10 hover:bg-white/20'}`}
            >
              {t.label}
            </button>
          ))}
          {tool === 'smear' && (
            <div className="ml-3 flex items-center gap-2 text-neutral-400">
              <label className="flex items-center gap-1">
                size
                <input
                  type="range"
                  min={8}
                  max={300}
                  value={brush.size}
                  onChange={(e) =>
                    setBrush((b) => ({ ...b, size: +e.target.value }))
                  }
                  className="w-20 accent-neutral-200"
                />
              </label>
              <label className="flex items-center gap-1">
                strength
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.01}
                  value={brush.strength}
                  onChange={(e) =>
                    setBrush((b) => ({ ...b, strength: +e.target.value }))
                  }
                  className="w-20 accent-neutral-200"
                />
              </label>
            </div>
          )}
        </div>
        <p className="absolute inset-x-0 bottom-0 flex h-8 items-center justify-center text-neutral-500">
          {TOOL_HINTS[tool]}
        </p>
        <ArtworkPlayer
          doc={doc}
          className="absolute! inset-x-8 top-12 bottom-9"
          onCompositor={(c) => (comp.current = c)}
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

      <aside className="flex min-h-0 flex-col overflow-y-auto border-l border-white/10">
        {layer ? (
          <>
            <div className="space-y-1.5 border-b border-white/10 px-3 py-3">
              <TextRow
                label="name"
                value={layer.name}
                onChange={(name) => patchLayer(layer.id, { name })}
              />
              <p className="text-neutral-500">
                {layer.type} · v{layer.version}
              </p>
              <div className="flex gap-1 pt-1">
                <PanelButton
                  onClick={() => patchLayer(layer.id, { frame: fullFrame() })}
                >
                  Fill artwork
                </PanelButton>
                {type && 'seed' in type.schema && (
                  <PanelButton
                    onClick={() =>
                      patchLayer(layer.id, {
                        values: { ...layerValues, seed: randomSeed() },
                      })
                    }
                  >
                    Re-seed
                  </PanelButton>
                )}
              </div>
            </div>
            <ControlGroups
              schema={shaderSchema(types)}
              values={{
                type: layer.type,
                fillSpace: layer.fillSpace ?? 'shape',
              }}
              onChange={(k, v) => {
                if (k === 'fillSpace')
                  return patchLayer(layer.id, {
                    fillSpace: v as LayerDoc['fillSpace'],
                  });
                const t = types[v as string];
                if (!t || v === layer.type) return;
                // Keep a name the user gave it; follow the shader otherwise.
                const named = layer.name !== type?.label;
                patchLayer(layer.id, {
                  type: v as string,
                  version: t.version,
                  values: { ...t.initial() },
                  ...(!named && { name: t.label }),
                });
              }}
            />
            <section className="border-b border-white/5 px-3 py-2">
              <div className="flex items-center justify-between pb-1.5">
                <span className="tracking-widest text-neutral-100 uppercase">
                  Shape
                </span>
                <span className="text-neutral-500">
                  {layer.shape ? layer.shape.kind : 'frame'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                <PanelButton onClick={() => setTool('edit')}>
                  Edit points
                </PanelButton>
                <PanelButton onClick={() => setTool('smear')}>
                  Smear
                </PanelButton>
                {layer.shape && (
                  <PanelButton
                    onClick={() => patchLayer(layer.id, { shape: undefined })}
                  >
                    Clear shape
                  </PanelButton>
                )}
              </div>
            </section>
            {layer.shape && layer.shape.kind !== 'path' && (
              <ControlGroups
                schema={shapeSchema(layer.shape.kind)}
                values={layer.shape}
                onChange={(k, v) =>
                  patchLayer(layer.id, {
                    shape: { ...layer.shape!, [k]: v },
                  })
                }
              />
            )}
            <ControlGroups
              schema={edgeSchema}
              values={edgeValues}
              onChange={(k, v) =>
                patchLayer(layer.id, { edge: { ...edgeValues, [k]: v } })
              }
              onReset={(group) => {
                const d = defaultsOf(edgeSchema);
                const next: Record<string, unknown> = { ...edgeValues };
                for (const [k, s] of Object.entries(edgeSchema))
                  if (s.group === group) next[k] = d[k as keyof typeof d];
                patchLayer(layer.id, { edge: next });
              }}
            />
            <ControlGroups
              schema={combineSchema(layer, doc.layers)}
              values={combineValues}
              onChange={(k, v) =>
                patchLayer(layer.id, { combine: { ...combineValues, [k]: v } })
              }
              onReset={() => patchLayer(layer.id, { combine: undefined })}
            />
            <ControlGroups
              schema={frameSchema}
              values={layer.frame}
              onChange={(k, v) =>
                patchLayer(layer.id, { frame: { ...layer.frame, [k]: v } })
              }
            />
            <ControlGroups
              schema={compositeSchema}
              values={layer}
              onChange={(k, v) => patchLayer(layer.id, { [k]: v })}
            />
            <ControlGroups
              schema={maskSchema(layer, doc.layers)}
              values={{ ...layer.mask, source: layer.mask.source ?? '' }}
              onChange={(k, v) =>
                patchLayer(layer.id, {
                  mask: {
                    ...layer.mask,
                    [k]: k === 'source' ? (v as string) || null : v,
                  },
                })
              }
            />
            <ControlGroups
              schema={fxSchema}
              values={layer.fx}
              onChange={(k, v) =>
                patchLayer(layer.id, { fx: { ...layer.fx, [k]: v } })
              }
              onReset={() => patchLayer(layer.id, { fx: { ...NO_FX } })}
            />
            {type && (
              <ControlGroups
                schema={type.schema}
                values={layerValues}
                onChange={(k, v) =>
                  patchLayer(layer.id, { values: { ...layerValues, [k]: v } })
                }
                onReset={(group) => {
                  const d = defaultsOf(type.schema);
                  const next = { ...layerValues };
                  for (const k in type.schema)
                    if (type.schema[k].group === group) next[k] = d[k];
                  patchLayer(layer.id, { values: next });
                }}
              />
            )}
          </>
        ) : (
          <p className="p-3 text-neutral-500">
            Add a layer, or pick one from the list.
          </p>
        )}
      </aside>
    </div>
  );
}

const randomSeed = () => 1 + Math.floor(Math.random() * 999);

const TOOL_HINTS: Record<Tool, string> = {
  select: 'click a shape to select · drag to move · corners resize',
  rect: 'drag to draw · shift for a square · click for a default size',
  ellipse: 'drag to draw · shift for a circle',
  triangle: 'drag to draw',
  polygon: 'drag to draw · sides in the inspector',
  star: 'drag to draw · points in the inspector',
  pen: 'draw a closed shape freehand',
  edit: 'drag points and handles · double-click the outline to add · alt-click a point for corner / smooth · delete removes',
  smear: 'drag across the outline to push it',
};

function TextRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="grid grid-cols-[3rem_1fr] items-center gap-2">
      <span className="text-neutral-400">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 rounded-sm bg-white/10 px-1.5 py-1 select-text"
      />
    </label>
  );
}
