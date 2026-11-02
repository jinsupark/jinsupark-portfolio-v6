import { useEffect, useState, useSyncExternalStore } from 'react';
import { ControlGroups, PanelButton } from './ControlRows';
import type { ControlStore, Schema } from './controls';

export type PanelAction = { label: string; onClick: () => void };

// The tuning panel every experiment shares. Tilde toggles it.
export default function ControlPanel<S extends Schema>({
  store,
  actions = [],
}: {
  store: ControlStore<S>;
  actions?: PanelAction[];
}) {
  const values = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '`' || e.key === '~') setOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'failed'>(
    'idle',
  );
  const dirty = JSON.stringify(values) !== JSON.stringify(store.defaults());
  const save = async () => {
    try {
      await store.saveDefaults();
      setSaveState('saved');
    } catch {
      setSaveState('failed');
    }
    setTimeout(() => setSaveState('idle'), 1500);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(values, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  if (!open) return null;
  return (
    <aside
      className="fixed top-3 right-3 bottom-3 z-50 flex w-72 flex-col overflow-hidden rounded-md bg-neutral-950/85 font-mono text-[10px] text-neutral-300 shadow-2xl backdrop-blur-md"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <header className="flex items-center justify-between border-b border-white/10 px-3 py-2 tracking-widest text-neutral-500 uppercase">
        <span>{store.id}</span>
        <span>~ to hide</span>
      </header>
      <div className="flex flex-wrap gap-1 border-b border-white/10 p-2">
        {actions.map((a) => (
          <PanelButton key={a.label} onClick={a.onClick}>
            {a.label}
          </PanelButton>
        ))}
        {import.meta.env.DEV && (
          <PanelButton onClick={save}>
            {saveState === 'saved'
              ? 'Saved'
              : saveState === 'failed'
                ? 'Save failed'
                : `Save defaults${dirty ? ' •' : ''}`}
          </PanelButton>
        )}
        <PanelButton onClick={copy}>
          {copied ? 'Copied' : 'Copy JSON'}
        </PanelButton>
        <PanelButton onClick={() => store.reset()}>Reset all</PanelButton>
      </div>
      <div className="flex-1 overflow-y-auto">
        <ControlGroups
          schema={store.schema}
          values={values}
          onChange={(key, v) => store.set(key, v as never)}
          onReset={(group) => store.reset(group)}
        />
      </div>
    </aside>
  );
}
