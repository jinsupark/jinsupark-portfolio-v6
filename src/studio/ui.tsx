import { ChevronDown, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
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

// A list shown top first (the last item on top, as in a stack), dragged to
// reorder. `row` draws an item's contents; rows carry `data-popover-anchor`
// so a popover opened from one doesn't close when another is clicked.
export function SortableList<T extends { id: string }>({
  items,
  onItems,
  row,
  empty,
  active,
}: {
  items: T[];
  onItems: (next: T[]) => void;
  row: (item: T) => React.ReactNode;
  empty?: string;
  active?: string | null;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const shown = [...items].reverse();
  const drop = () => {
    if (dragging !== null && over !== null) {
      const from = shown.findIndex((x) => x.id === dragging);
      const slot = over > from ? over - 1 : over;
      const list = items.filter((x) => x.id !== dragging);
      list.splice(
        list.length - slot,
        0,
        items.find((x) => x.id === dragging)!,
      );
      onItems(list);
    }
    setDragging(null);
    setOver(null);
  };
  return (
    <ul
      className="-mx-1.5 flex flex-col gap-0.5"
      onDragOver={(e) => e.preventDefault()}
      onDrop={drop}
    >
      {shown.length === 0 && empty && (
        <li className="px-1.5 py-1 text-neutral-400">{empty}</li>
      )}
      {shown.map((x, i) => (
        <li
          key={x.id}
          draggable
          data-popover-anchor
          onDragStart={(e) => {
            if ((e.target as Element).closest('input'))
              return e.preventDefault();
            e.dataTransfer.effectAllowed = 'move';
            setDragging(x.id);
          }}
          onDragEnd={() => {
            setDragging(null);
            setOver(null);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            setOver(e.clientY < r.top + r.height / 2 ? i : i + 1);
          }}
          className={`relative flex h-7 shrink-0 items-center gap-1.5 rounded-md pr-0.5 pl-1.5 ${active === x.id ? 'bg-sky-500/12' : 'hover:bg-black/4'} ${dragging === x.id ? 'opacity-40' : ''}`}
        >
          {over === i && dragging && (
            <span className="absolute inset-x-1 -top-px h-0.5 bg-sky-500" />
          )}
          {over === shown.length && i === shown.length - 1 && dragging && (
            <span className="absolute inset-x-1 -bottom-px h-0.5 bg-sky-500" />
          )}
          {row(x)}
        </li>
      ))}
    </ul>
  );
}

// A floating panel: drag its header to move it; Escape or a click outside
// closes it. Popovers can open from inside one another; Escape closes the
// innermost, and clicks in any popover or on a list row leave them be.
export function Popover({
  title,
  at,
  onClose,
  actions,
  width = 264,
  children,
}: {
  title: React.ReactNode;
  at: { top: number; left: number };
  onClose: () => void;
  actions?: React.ReactNode;
  width?: number;
  children: React.ReactNode;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const all = document.querySelectorAll('[data-popover]');
      if (all[all.length - 1] !== el.current) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close.current();
    };
    const down = (e: PointerEvent) => {
      const t = e.target as Element;
      if (t.closest?.('[data-popover], [data-popover-anchor]')) return;
      close.current();
    };
    addEventListener('keydown', key, true);
    addEventListener('pointerdown', down, true);
    return () => {
      removeEventListener('keydown', key, true);
      removeEventListener('pointerdown', down, true);
    };
  }, []);

  // Drag by the header, kept on screen.
  const drag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    e.preventDefault();
    const head = e.currentTarget;
    const box = el.current!.getBoundingClientRect();
    const dx = e.clientX - box.left;
    const dy = e.clientY - box.top;
    head.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) =>
      setPos({
        left: Math.max(0, Math.min(m.clientX - dx, innerWidth - box.width)),
        top: Math.max(0, Math.min(m.clientY - dy, innerHeight - 36)),
      });
    const up = () => {
      head.removeEventListener('pointermove', move);
      head.removeEventListener('pointerup', up);
    };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
  };

  return (
    <div
      ref={el}
      data-popover
      style={{
        top: pos.top,
        left: pos.left,
        width,
        maxHeight: `calc(100vh - ${pos.top + 8}px)`,
      }}
      className="fixed z-50 flex flex-col overflow-hidden rounded-lg border border-black/10 bg-white text-[11px] shadow-[0_8px_32px_rgb(0_0_0/0.18),0_1px_3px_rgb(0_0_0/0.08)] select-none"
    >
      <div
        onPointerDown={drag}
        className="flex h-9 shrink-0 cursor-grab items-center gap-0.5 border-b border-black/6 pr-1.5 pl-3 active:cursor-grabbing"
      >
        <span className="min-w-0 flex-1 truncate font-semibold text-neutral-900">
          {title}
        </span>
        {actions}
        <IconButton title="Close (Esc)" onClick={onClose}>
          <X size={13} />
        </IconButton>
      </div>
      <div className="min-h-0 overflow-y-auto">{children}</div>
    </div>
  );
}
