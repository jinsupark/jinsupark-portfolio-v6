import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import type { Control, Schema } from './controls';

// Whether a section is open, remembered per `id` across reloads.
function useOpen(id: string | undefined, initial: boolean) {
  const key = id && `ui:open:${id}`;
  const [open, set] = useState(() => {
    const saved = key ? localStorage.getItem(key) : null;
    return saved === null ? initial : saved === '1';
  });
  const toggle = () =>
    set((o) => {
      if (key) localStorage.setItem(key, o ? '0' : '1');
      return !o;
    });
  return [open, toggle] as const;
}

// A collapsible block with a title row: the inspector's unit, and what each
// control group renders as. `id` remembers its open state; `aside` sits at
// the right of the title row (a reset, a count, an action).
export function Section({
  title,
  id,
  defaultOpen = true,
  aside,
  onReset,
  children,
}: {
  title: React.ReactNode;
  id?: string;
  defaultOpen?: boolean;
  aside?: React.ReactNode;
  onReset?: () => void;
  children: React.ReactNode;
}) {
  const [open, toggle] = useOpen(id, defaultOpen);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <section className="border-b border-white/5">
      <div className="flex h-8 items-center gap-1 pr-2 pl-1.5">
        <button
          onClick={toggle}
          className="flex min-w-0 flex-1 items-center gap-1 self-stretch tracking-widest text-neutral-100 uppercase"
        >
          <Chevron size={12} className="shrink-0 text-neutral-500" />
          <span className="truncate">{title}</span>
        </button>
        {aside}
        {onReset && (
          <IconButton title="Reset" onClick={onReset}>
            <RotateCcw size={11} />
          </IconButton>
        )}
      </div>
      {open && <div className="space-y-1.5 px-3 pb-3">{children}</div>}
    </section>
  );
}

export function IconButton({
  title,
  onClick,
  active,
  children,
  className = '',
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`grid size-6 place-items-center rounded-sm ${active ? 'bg-sky-400/25 text-neutral-50' : 'text-neutral-500 hover:bg-white/10 hover:text-neutral-100'} ${className}`}
    >
      {children}
    </button>
  );
}

// The grouped control rows the lab panel shows, as a component of their own so
// the studio's inspector can show a layer's controls the same way. A control
// whose `when` fails is left out, and a group with nothing left to show goes
// too. `id` remembers each group's open state; `closed` lists groups that
// start shut.
export function ControlGroups({
  schema,
  values,
  onChange,
  onReset,
  id,
  closed = [],
  titles = {},
}: {
  schema: Schema;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  onReset?: (group: string) => void;
  id?: string;
  closed?: string[];
  titles?: Record<string, string>;
}) {
  const groups: [string, string[]][] = [];
  for (const key of Object.keys(schema)) {
    if (schema[key].when && !schema[key].when!(values)) continue;
    const g = schema[key].group;
    let entry = groups.find(([name]) => name === g);
    if (!entry) groups.push((entry = [g, []]));
    entry[1].push(key);
  }
  return groups.map(([group, keys]) => (
    <Section
      key={group}
      title={titles[group] ?? group}
      id={id && `${id}:${group}`}
      defaultOpen={!closed.includes(group)}
      onReset={onReset && (() => onReset(group))}
    >
      {keys.map((key) => (
        <Row
          key={key}
          name={key}
          control={schema[key]}
          value={values[key]}
          onChange={(v) => onChange(key, v)}
        />
      ))}
    </Section>
  ));
}

// A schema's rows with no group headers, for a section that has its own.
export function Rows({
  schema,
  values,
  onChange,
}: {
  schema: Schema;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return Object.keys(schema)
    .filter((k) => !schema[k].when || schema[k].when!(values))
    .map((key) => (
      <Row
        key={key}
        name={key}
        control={schema[key]}
        value={values[key]}
        onChange={(v) => onChange(key, v)}
      />
    ));
}

// "strokeAlign" -> "stroke align", for controls without a label of their own.
const words = (key: string) =>
  key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

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
  const label = control.label ?? words(name);
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
