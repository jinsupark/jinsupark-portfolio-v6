import { useState } from 'react';
import type { Control, Schema } from './controls';

// The grouped control rows the lab panel shows, as a component of their own so
// the studio's inspector can show a layer's controls the same way.
export function ControlGroups({
  schema,
  values,
  onChange,
  onReset,
}: {
  schema: Schema;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  onReset?: (group: string) => void;
}) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const groups: [string, string[]][] = [];
  for (const key of Object.keys(schema)) {
    const g = schema[key].group;
    let entry = groups.find(([name]) => name === g);
    if (!entry) groups.push((entry = [g, []]));
    entry[1].push(key);
  }
  return groups.map(([group, keys]) => (
    <section key={group} className="border-b border-white/5">
      <div className="flex items-center justify-between px-3 py-2">
        <button
          className="tracking-widest text-neutral-100 uppercase"
          onClick={() => setClosed((c) => ({ ...c, [group]: !c[group] }))}
        >
          {closed[group] ? '+' : '−'} {group}
        </button>
        {onReset && (
          <button
            className="text-neutral-600 hover:text-neutral-300"
            onClick={() => onReset(group)}
          >
            reset
          </button>
        )}
      </div>
      {!closed[group] && (
        <div className="space-y-1.5 px-3 pb-3">
          {keys.map((key) => (
            <Row
              key={key}
              name={key}
              control={schema[key]}
              value={values[key]}
              onChange={(v) => onChange(key, v)}
            />
          ))}
        </div>
      )}
    </section>
  ));
}

export function PanelButton({
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

export function Row({
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
            className="w-full min-w-0 accent-neutral-200"
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
    case 'text':
      return (
        <label className="grid grid-cols-[7rem_1fr] items-center gap-2">
          <span className="truncate text-neutral-400">{label}</span>
          <input
            value={value as string}
            onChange={(e) => onChange(e.target.value)}
            className="min-w-0 rounded-sm bg-white/10 px-1 py-0.5 select-text"
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
