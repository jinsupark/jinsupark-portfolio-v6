import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Control, ControlStore, Schema } from './controls';

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
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '`' || e.key === '~') setOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const groups: [string, string[]][] = [];
  for (const key of Object.keys(store.schema)) {
    const g = store.schema[key].group;
    let entry = groups.find(([name]) => name === g);
    if (!entry) groups.push((entry = [g, []]));
    entry[1].push(key);
  }

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
        <PanelButton onClick={copy}>
          {copied ? 'Copied' : 'Copy JSON'}
        </PanelButton>
        <PanelButton onClick={() => store.reset()}>Reset all</PanelButton>
      </div>
      <div className="flex-1 overflow-y-auto">
        {groups.map(([group, keys]) => (
          <section key={group} className="border-b border-white/5">
            <div className="flex items-center justify-between px-3 py-2">
              <button
                className="tracking-widest text-neutral-100 uppercase"
                onClick={() => setClosed((c) => ({ ...c, [group]: !c[group] }))}
              >
                {closed[group] ? '+' : '−'} {group}
              </button>
              <button
                className="text-neutral-600 hover:text-neutral-300"
                onClick={() => store.reset(group)}
              >
                reset
              </button>
            </div>
            {!closed[group] && (
              <div className="space-y-1.5 px-3 pb-3">
                {keys.map((key) => (
                  <Row
                    key={key}
                    name={key}
                    control={store.schema[key]}
                    value={values[key]}
                    onChange={(v) => store.set(key, v as never)}
                  />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </aside>
  );
}

function PanelButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-sm bg-white/10 px-2 py-1 tracking-wider uppercase hover:bg-white/20"
    >
      {children}
    </button>
  );
}

function Row({
  name,
  control,
  value,
  onChange,
}: {
  name: string;
  control: Control;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = control.label ?? name;
  switch (control.kind) {
    case 'range': {
      const v = value as number;
      const digits =
        control.step >= 1
          ? 0
          : control.step >= 0.1
            ? 1
            : control.step >= 0.01
              ? 2
              : 3;
      return (
        <label className="grid grid-cols-[7rem_1fr_2.75rem] items-center gap-2">
          <span className="truncate text-neutral-400">{label}</span>
          <input
            type="range"
            min={control.min}
            max={control.max}
            step={control.step}
            value={v}
            onChange={(e) => onChange(Number(e.target.value))}
            className="accent-neutral-200"
          />
          <span className="text-right tabular-nums">{v.toFixed(digits)}</span>
        </label>
      );
    }
    case 'color':
      return (
        <label className="grid grid-cols-[7rem_1fr] items-center gap-2">
          <span className="truncate text-neutral-400">{label}</span>
          <span className="flex items-center gap-2">
            <input
              type="color"
              value={value as string}
              onChange={(e) => onChange(e.target.value)}
              className="h-4 w-8 cursor-pointer bg-transparent"
            />
            <span>{value as string}</span>
          </span>
        </label>
      );
    case 'toggle':
      return (
        <label className="grid grid-cols-[7rem_1fr] items-center gap-2">
          <span className="truncate text-neutral-400">{label}</span>
          <input
            type="checkbox"
            checked={value as boolean}
            onChange={(e) => onChange(e.target.checked)}
            className="justify-self-start accent-neutral-200"
          />
        </label>
      );
    case 'select':
      return (
        <label className="grid grid-cols-[7rem_1fr] items-center gap-2">
          <span className="truncate text-neutral-400">{label}</span>
          <select
            value={value as string}
            onChange={(e) => onChange(e.target.value)}
            className="min-w-0 rounded-sm bg-white/10 px-1 py-0.5"
          >
            {control.options.map((o) => (
              <option key={o.value} value={o.value} className="bg-neutral-900">
                {o.label}
              </option>
            ))}
          </select>
        </label>
      );
  }
}
