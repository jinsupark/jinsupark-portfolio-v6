import { Link } from '@tanstack/react-router';
import { ArrowLeft, Dices, RotateCcw } from 'lucide-react';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { defaultsOf, fit } from '@/lab/controls';
import ArtworkPlayer from './ArtworkPlayer';
import { ASPECTS, type Size } from './document';
import type { LayerType } from './layer';
import { shaderArtwork } from './shaders';
import { resetGroup } from './tools';
import {
  ControlGroups,
  IconButton,
  Labeled,
  PanelHeader,
  Section,
  SelectField,
} from './ui';
import './studio.css';

const randomSeed = () => 1 + Math.floor(Math.random() * 999);
const noStore = () => () => {};

// One shader on its own, to tune it the way it renders inside an artwork.
// For a shader backed by an experiment, the settings are that experiment's
// own store: what you set here is what a new fill of it starts from, and
// "Save as defaults" (dev server only) writes them to its preset.
export default function ShaderPlayground({ type }: { type: LayerType }) {
  const store = type.store;
  const stored = useSyncExternalStore(
    store?.subscribe ?? noStore,
    () => store?.getSnapshot() ?? null,
  );
  const [local, setLocal] = useState<Record<string, unknown>>(() => ({
    ...type.initial(),
  }));
  const values = useMemo(
    () => ({
      ...defaultsOf(type.schema),
      ...fit(stored ?? local, type.schema),
    }),
    [stored, local, type.schema],
  );
  const set = (k: string, v: unknown) =>
    store ? store.set(k, v) : setLocal((x) => ({ ...x, [k]: v }));

  const [size, setSize] = useState<Size>({ w: 800, h: 1000 });
  const doc = useMemo(
    () => shaderArtwork(type, values, size),
    [type, values, size],
  );
  const [status, setStatus] = useState('');

  return (
    <div className="studio fixed inset-0 grid grid-cols-[minmax(0,1fr)_17.5rem] bg-neutral-50 text-[11px] text-neutral-800 select-none">
      <main className="relative min-h-0 bg-neutral-400">
        <ArtworkPlayer doc={doc} navigable className="absolute! inset-0" />
        <header className="absolute top-3 left-3 flex items-center gap-1 rounded-md border border-black/10 bg-white/95 py-1 pr-3 pl-1 shadow-sm">
          <Link
            to="/projects"
            search={{ tab: 'shaders' }}
            title="All shaders"
            className="grid size-6 place-items-center rounded-md text-neutral-500 hover:bg-black/5 hover:text-neutral-900"
          >
            <ArrowLeft size={13} />
          </Link>
          <span className="text-[12px] font-semibold text-neutral-900">
            {type.label}
          </span>
        </header>
      </main>

      <aside className="flex min-h-0 flex-col overflow-y-auto border-l border-black/8">
        <PanelHeader title={type.label} meta="Shader" />
        <Section id="shader:canvas" title="Canvas">
          <Labeled label="aspect">
            <SelectField
              value={
                ASPECTS.find((a) => a.size.w === size.w && a.size.h === size.h)
                  ?.label ?? '4:5'
              }
              options={ASPECTS.map((a) => ({ value: a.label, label: a.label }))}
              onChange={(v) => {
                const a = ASPECTS.find((x) => x.label === v);
                if (a) setSize(a.size);
              }}
            />
          </Labeled>
        </Section>
        <Section
          id="shader:settings"
          title="Settings"
          aside={
            <>
              {'seed' in type.schema && (
                <IconButton
                  title="Re-seed"
                  onClick={() => set('seed', randomSeed())}
                >
                  <Dices size={12} />
                </IconButton>
              )}
              <IconButton
                title="Reset all"
                onClick={() =>
                  store
                    ? store.reset()
                    : setLocal({ ...defaultsOf(type.schema) })
                }
              >
                <RotateCcw size={12} />
              </IconButton>
            </>
          }
        >
          <p className="text-neutral-400">
            {store
              ? 'New fills of this shader start from these settings.'
              : 'These settings are for trying out; this shader has no saved defaults.'}
          </p>
        </Section>
        <ControlGroups
          id={`shader:${type.type}`}
          schema={type.schema}
          values={values}
          onChange={set}
          onReset={(g) => {
            if (store) store.reset(g);
            else setLocal(resetGroup(type.schema, values, g));
          }}
        />
        {import.meta.env.DEV && store && (
          <div className="mt-auto border-t border-black/6 p-3">
            <button
              onClick={async () => {
                setStatus('saving…');
                try {
                  await store.saveDefaults();
                  setStatus('saved as defaults');
                } catch (e) {
                  setStatus(`save failed: ${String(e)}`);
                }
              }}
              className="flex h-7 w-full items-center justify-center rounded-md border border-black/10 bg-white font-medium text-neutral-800 hover:bg-neutral-50"
            >
              Save as defaults
            </button>
            {status && <p className="mt-2 text-neutral-500">{status}</p>}
          </div>
        )}
      </aside>
    </div>
  );
}
