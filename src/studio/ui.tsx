import { ChevronDown, RotateCcw } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Control, RangeControl, Schema } from '@/lab/controls';

// The studio's own controls, in a light, compact macOS style. They mirror the
// lab's ControlRows API so a schema renders the same way, but the studio owns
// their look and can stand alone.

const FIELD =
  'h-6 min-w-0 rounded-md border border-black/10 bg-white text-neutral-800 shadow-[0_1px_0_rgb(0_0_0/0.02)] focus-within:border-sky-500/70';

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const words = (key: string) =>
  key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
const digitsOf = (step: number) =>
  step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;

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

// A titled block. Click the title to open or shut it; a shut one reads grey.
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
  return (
    <section className="border-b border-black/6">
      <div className="flex h-9 items-center gap-0.5 pr-2 pl-3">
        <button
          onClick={toggle}
          className={`min-w-0 flex-1 self-stretch truncate text-left font-medium ${open ? 'text-neutral-900' : 'text-neutral-400 hover:text-neutral-600'}`}
        >
          {title}
        </button>
        {open && aside}
        {open && onReset && (
          <IconButton title="Reset" onClick={onReset}>
            <RotateCcw size={12} />
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
      className={`grid size-6 shrink-0 place-items-center rounded-md ${active ? 'bg-black/8 text-neutral-900' : 'text-neutral-500 hover:bg-black/5 hover:text-neutral-900'} ${className}`}
    >
      {children}
    </button>
  );
}

// A number box. Type a value, nudge it with the arrow keys (shift for ×10),
// or drag the prefix sideways to scrub. `factor` scales what's shown, so an
// opacity of 0–1 can read as a percentage.
export function NumberField({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  factor = 1,
  prefix,
  suffix,
  className = '',
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  factor?: number;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancel = useRef(false);
  const shown = (value * factor).toFixed(digitsOf(step * factor));
  const set = (v: number) =>
    onChange(
      Math.min(
        max,
        Math.max(min, +(Math.round(v / step) * step).toFixed(digitsOf(step))),
      ),
    );

  const scrub = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    const x0 = e.clientX;
    const v0 = value;
    el.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) =>
      set(v0 + (m.clientX - x0) * step * (m.shiftKey ? 10 : 1));
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  return (
    <label className={`${FIELD} flex items-center gap-1.5 px-1.5 ${className}`}>
      {prefix && (
        <span
          onPointerDown={scrub}
          className="flex shrink-0 cursor-ew-resize items-center text-neutral-400 select-none"
        >
          {prefix}
        </span>
      )}
      <input
        value={draft ?? shown}
        inputMode="decimal"
        onFocus={(e) => {
          setDraft(shown);
          e.currentTarget.select();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = parseFloat(draft ?? '');
          if (!cancel.current && Number.isFinite(n)) set(n / factor);
          cancel.current = false;
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            cancel.current = true;
            e.currentTarget.blur();
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const d = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1);
            const next = Math.min(max, Math.max(min, value + d * step));
            set(next);
            setDraft((next * factor).toFixed(digitsOf(step * factor)));
          }
        }}
        className="w-full min-w-0 bg-transparent tabular-nums outline-none select-text"
      />
      {suffix && <span className="shrink-0 text-neutral-400">{suffix}</span>}
    </label>
  );
}

const rangeOf = (c: RangeControl) => ({
  min: c.min,
  max: c.max,
  step: c.step,
});

// A number box bound to one range control of a schema, for custom layouts.
export function SchemaNumber({
  control,
  value,
  onChange,
  ...rest
}: {
  control: Control;
  value: number;
  onChange: (v: number) => void;
  factor?: number;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  className?: string;
}) {
  return (
    <NumberField
      value={value}
      onChange={onChange}
      {...(control.kind === 'range' && rangeOf(control))}
      {...rest}
    />
  );
}

export function TextArea({
  value,
  onChange,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      className={`${FIELD} h-auto w-full resize-none px-1.5 py-1 outline-none select-text focus:border-sky-500/70`}
    />
  );
}

export function SelectField({
  value,
  options,
  onChange,
  className = '',
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <span className={`${FIELD} relative flex items-center ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full w-full min-w-0 cursor-pointer appearance-none truncate bg-transparent pr-5 pl-1.5 outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {sentence(o.label)}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        className="pointer-events-none absolute right-1.5 text-neutral-400"
      />
    </span>
  );
}

export function TextField({
  value,
  onChange,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${FIELD} w-full px-1.5 outline-none select-text focus:border-sky-500/70 ${className}`}
    />
  );
}

// A label on the left and its control on the right.
export function Labeled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2">
      <span className="truncate text-neutral-500">{sentence(label)}</span>
      {children}
    </label>
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
    case 'range':
      return (
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_3.5rem] items-center gap-2">
          <span className="truncate text-neutral-500">{sentence(label)}</span>
          <input
            type="range"
            min={control.min}
            max={control.max}
            step={control.step}
            value={value as number}
            onChange={(e) => onChange(Number(e.target.value))}
            className="studio-range"
          />
          <NumberField
            value={value as number}
            onChange={onChange}
            {...rangeOf(control)}
          />
        </div>
      );
    case 'color':
      return (
        <Labeled label={label}>
          <span className={`${FIELD} flex items-center gap-1.5 px-1`}>
            <input
              type="color"
              value={value as string}
              onChange={(e) => onChange(e.target.value)}
              className="studio-swatch"
            />
            <span className="uppercase tabular-nums">
              {(value as string).replace('#', '')}
            </span>
          </span>
        </Labeled>
      );
    case 'toggle':
      return (
        <Labeled label={label}>
          <input
            type="checkbox"
            checked={value as boolean}
            onChange={(e) => onChange(e.target.checked)}
            className="justify-self-start accent-neutral-800"
          />
        </Labeled>
      );
    case 'text':
      return (
        <Labeled label={label}>
          <TextField value={value as string} onChange={onChange} />
        </Labeled>
      );
    case 'select':
      return (
        <Labeled label={label}>
          <SelectField
            value={value as string}
            options={control.options}
            onChange={onChange}
          />
        </Labeled>
      );
  }
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

// A schema as one section per group. A control whose `when` fails is left
// out, and a group with nothing left to show goes too. `closed` lists groups
// that start shut.
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
