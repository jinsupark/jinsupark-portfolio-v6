import { Check, ChevronDown, RotateCcw, X } from 'lucide-react';
import { Children, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Control, RangeControl, Schema } from '@/lab/controls';
import { announcePopover, popoverAt, useOnOtherPopover } from './tools';

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

// A titled block, always open. (`id` and `defaultOpen` are accepted from
// callers written when sections folded, and ignored.)
export function Section({
  title,
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
  return (
    <section className="border-b border-black/6">
      <div className="flex h-9 items-center gap-0.5 pr-2 pl-3">
        <span className="min-w-0 flex-1 truncate font-medium text-neutral-900">
          {title}
        </span>
        {aside}
        {onReset && (
          <IconButton title="Reset" onClick={onReset}>
            <RotateCcw size={12} />
          </IconButton>
        )}
      </div>
      {Children.toArray(children).length > 0 && (
        <div className="flex flex-col gap-1.5 px-3 pb-3">{children}</div>
      )}
    </section>
  );
}

// Tooltips warm up, as in macOS and Figma: the first waits a moment, but
// while one is showing (or just was) the next shows at once.
let tipsShowing = 0;
let tipLastHidden = 0;
const WARM_MS = 500;

// A hover label like Paper's: the name, and its shortcut in grey, shown after
// a moment beside the element. "Undo (⌘Z)" splits into the two.
export function Tip({
  label,
  side = 'bottom',
  children,
}: {
  label: string;
  side?: 'bottom' | 'right';
  children: React.ReactNode;
}) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef(0);
  const m = /^(.*?)\s*\(([^()]+)\)$/.exec(label);
  const [name, keys] = m ? [m[1], m[2]] : [label, ''];
  const show = (el: HTMLElement) => {
    clearTimeout(timer.current);
    const warm = tipsShowing > 0 || performance.now() - tipLastHidden < WARM_MS;
    timer.current = window.setTimeout(
      () => {
        const r = el.getBoundingClientRect();
        setAt(
          side === 'right'
            ? { x: r.right + 8, y: r.top + r.height / 2 }
            : { x: r.left + r.width / 2, y: r.bottom + 6 },
        );
      },
      warm ? 0 : 450,
    );
  };
  const hide = () => {
    clearTimeout(timer.current);
    setAt(null);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  // Count this one while it's up, and note when it went, for the warm-up.
  const shown = at !== null;
  useEffect(() => {
    if (!shown) return;
    tipsShowing++;
    return () => {
      tipsShowing--;
      tipLastHidden = performance.now();
    };
  }, [shown]);
  return (
    <span
      className="contents"
      onPointerEnter={(e) => show(e.target as HTMLElement)}
      onPointerLeave={hide}
      onPointerDown={hide}
    >
      {children}
      {at && (
        <span
          role="tooltip"
          style={{ left: at.x, top: at.y }}
          className={`pointer-events-none fixed z-[60] flex items-center gap-2 rounded-lg border border-black/8 bg-white px-2 py-1 text-[11px] whitespace-nowrap text-neutral-800 shadow-[0_2px_8px_rgb(0_0_0/0.12)] ${side === 'right' ? '-translate-y-1/2' : '-translate-x-1/2'}`}
        >
          {name}
          {keys && <span className="text-neutral-400">{keys}</span>}
        </span>
      )}
    </span>
  );
}

export function IconButton({
  title,
  onClick,
  active,
  children,
  className = '',
  tip = 'bottom',
}: {
  title: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  children: React.ReactNode;
  className?: string;
  // Which side its hover label shows on.
  tip?: 'bottom' | 'right';
}) {
  return (
    <Tip label={title} side={tip}>
      <button
        aria-label={title}
        onClick={onClick}
        className={`grid size-6 shrink-0 place-items-center rounded-md outline-none ${active ? 'bg-sky-500 text-[#fff]' : 'text-neutral-500 hover:bg-black/5 hover:text-neutral-900'} ${className}`}
      >
        {children}
      </button>
    </Tip>
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
        data-value-field
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

// A choice in a menu. `{ value: '-' }` draws a separator.
export type MenuOption = { value: string; label: string };

// A macOS-style menu under `anchor`: a tick on the current value, a blue
// highlight that follows the pointer and the arrow keys, Enter to pick, Esc
// or a click outside to close.
export function Menu({
  anchor,
  trigger,
  options,
  value,
  onPick,
  onClose,
}: {
  anchor: DOMRect;
  // The button that opened it: a press there is left to the button, which
  // closes the menu itself, rather than closing and reopening it.
  trigger?: Element | null;
  options: MenuOption[];
  value?: string;
  onPick: (v: string) => void;
  onClose: () => void;
}) {
  const picks = options.filter((o) => o.value !== '-');
  const [hi, setHi] = useState(() => picks.findIndex((o) => o.value === value));
  const el = useRef<HTMLDivElement>(null);
  const latest = useRef({ hi, picks, onPick, onClose, trigger });
  useEffect(() => {
    latest.current = { hi, picks, onPick, onClose, trigger };
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const l = latest.current;
      const n = l.picks.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const d = e.key === 'ArrowDown' ? 1 : -1;
        setHi((h) => (h < 0 ? (d > 0 ? 0 : n - 1) : (h + d + n) % n));
      } else if (e.key === 'Enter' && l.hi >= 0) {
        l.onPick(l.picks[l.hi].value);
        l.onClose();
      } else if (e.key === 'Escape') l.onClose();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (el.current?.contains(t) || latest.current.trigger?.contains(t))
        return;
      latest.current.onClose();
    };
    addEventListener('keydown', key, true);
    addEventListener('pointerdown', down, true);
    return () => {
      removeEventListener('keydown', key, true);
      removeEventListener('pointerdown', down, true);
    };
  }, []);
  const below = innerHeight - anchor.bottom > 220 || anchor.top < 220;
  // Opens from the anchor's left edge; if that would run off the window, it
  // lines up with the anchor's right edge instead.
  const [left, setLeft] = useState(anchor.left);
  useLayoutEffect(() => {
    const w = el.current?.offsetWidth ?? 0;
    if (anchor.left + w > innerWidth - 8)
      setLeft(Math.max(8, Math.min(anchor.right, innerWidth - 8) - w));
  }, [anchor]);
  return createPortal(
    <div
      ref={el}
      data-popover-anchor
      role="listbox"
      style={{
        left,
        minWidth: Math.max(100, anchor.width),
        ...(below
          ? {
              top: anchor.bottom + 4,
              maxHeight: innerHeight - anchor.bottom - 12,
            }
          : {
              bottom: innerHeight - anchor.top + 4,
              maxHeight: anchor.top - 12,
            }),
      }}
      className="fixed z-[70] overflow-y-auto rounded-lg border border-black/10 bg-white/95 p-1 text-[11px] text-neutral-800 shadow-[0_8px_28px_rgb(0_0_0/0.18),0_1px_3px_rgb(0_0_0/0.08)] backdrop-blur-sm"
    >
      {options.map((o, k) => {
        if (o.value === '-')
          return <div key={`sep-${k}`} className="mx-2 my-1 h-px bg-black/8" />;
        const i = picks.indexOf(o);
        return (
          <button
            key={o.value}
            role="option"
            aria-selected={o.value === value}
            onPointerEnter={() => setHi(i)}
            onClick={() => {
              onPick(o.value);
              onClose();
            }}
            className={`flex h-6 w-full items-center gap-1.5 rounded-[5px] pr-3 text-left whitespace-nowrap ${value === undefined ? 'pl-2.5' : 'pl-1.5'} ${i === hi ? 'bg-sky-500 text-white' : ''}`}
          >
            {value !== undefined && (
              <Check
                size={11}
                strokeWidth={2.5}
                className={o.value === value ? '' : 'invisible'}
              />
            )}
            {o.label}
          </button>
        );
      })}
    </div>,
    document.querySelector('.studio') ?? document.body,
  );
}

export function SelectField({
  value,
  options,
  onChange,
  className = '',
}: {
  value: string;
  options: MenuOption[];
  onChange: (v: string) => void;
  className?: string;
}) {
  const [at, setAt] = useState<{ rect: DOMRect; el: Element } | null>(null);
  const current = options.find((o) => o.value === value);
  const label = (o: MenuOption) => ({ ...o, label: sentence(o.label) });
  return (
    <>
      <button
        type="button"
        onClick={(e) =>
          setAt(
            at
              ? null
              : {
                  rect: e.currentTarget.getBoundingClientRect(),
                  el: e.currentTarget,
                },
          )
        }
        className={`${FIELD} relative flex min-w-0 items-center pr-5 pl-1.5 text-left ${at ? 'border-sky-500/70' : ''} ${className}`}
      >
        <span className="truncate">
          {current ? sentence(current.label) : value}
        </span>
        <ChevronDown
          size={12}
          className="pointer-events-none absolute right-1.5 text-neutral-400"
        />
      </button>
      {at && (
        <Menu
          anchor={at.rect}
          trigger={at.el}
          options={options.map(label)}
          value={value}
          onPick={onChange}
          onClose={() => setAt(null)}
        />
      )}
    </>
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
          <ColorField value={value as string} onChange={onChange} />
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
  // The item (or items) whose popover is open, shown highlighted.
  active?: string | string[] | null;
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
          className={`relative flex h-7 shrink-0 items-center gap-1.5 rounded-md pr-0.5 pl-1.5 ${(Array.isArray(active) ? active.includes(x.id) : active === x.id) ? 'bg-sky-500/12' : 'hover:bg-black/4'} ${dragging === x.id ? 'opacity-40' : ''}`}
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

  // Drawn at the studio's root rather than where it was opened, so nothing it
  // sits inside (a label, say) can react to clicks in it.
  return createPortal(
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
    </div>,
    document.querySelector('.studio') ?? document.body,
  );
}

// A sidebar's edge you can drag to resize it, as in Paper. `edge` is the
// handle's distance from the side the sidebar is on.
export function ResizeHandle({
  side,
  edge,
  min,
  max,
  onResize,
  onDone,
}: {
  side: 'left' | 'right';
  edge: number;
  min: number;
  max: number;
  onResize: (width: number) => void;
  onDone?: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      style={{ [side]: edge - 3 }}
      onPointerDown={(e) => {
        e.preventDefault();
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        setDragging(true);
        const move = (m: PointerEvent) => {
          const w = side === 'left' ? m.clientX : innerWidth - m.clientX;
          onResize(Math.round(Math.min(max, Math.max(min, w))));
        };
        const up = () => {
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
          setDragging(false);
          onDone?.();
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
      }}
      className="group absolute top-0 bottom-0 z-40 w-1.5 cursor-col-resize"
    >
      <span
        className={`absolute inset-y-0 left-[2px] w-0.5 ${dragging ? 'bg-sky-500' : 'group-hover:bg-sky-500/50'}`}
      />
    </div>
  );
}

// Colour maths for the picker. Values stay hex strings everywhere else.
type RGB = [number, number, number];
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const toRgb = (hex: string): RGB => {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = ([r, g, b]: RGB) =>
  '#' +
  [r, g, b]
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
function rgbToHsv([r, g, b]: RGB): RGB {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const d = max - Math.min(R, G, B);
  let h = 0;
  if (d) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
  }
  return [(h * 60 + 360) % 360, max ? d / max : 0, max];
}
function hsvToRgb([h, s, v]: RGB): RGB {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return 255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)));
  };
  return [f(5), f(3), f(1)];
}
function rgbToHsl([r, g, b]: RGB): RGB {
  const [h, s, v] = rgbToHsv([r, g, b]);
  const l = v * (1 - s / 2);
  return [h, l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l), l];
}
function hslToRgb([h, s, l]: RGB): RGB {
  const v = l + s * Math.min(l, 1 - l);
  return hsvToRgb([h, v ? 2 * (1 - l / v) : 0, v]);
}

// A swatch and hex that opens the picker.
export function ColorField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [me] = useState(() => ({}));
  useOnOtherPopover(me, () => setAt(null));
  const commit = () => {
    const h = (draft ?? '').replace(/[^0-9a-f]/gi, '');
    if (h.length === 3 || h.length === 6)
      onChange(
        `#${(h.length === 3 ? h.replace(/./g, '$&$&') : h).toLowerCase()}`,
      );
    setDraft(null);
  };
  return (
    <>
      <span className={`${FIELD} flex items-center gap-1.5 px-1`}>
        <button
          data-popover-anchor
          aria-label="Pick a colour"
          onClick={(e) => {
            if (at) return setAt(null);
            if (!e.currentTarget.closest('[data-popover]')) announcePopover(me);
            setAt(popoverAt(e.currentTarget, 280));
          }}
          className="size-3.5 shrink-0 rounded-[3px] border border-black/15"
          style={{ background: value }}
        />
        <input
          value={draft ?? value.replace('#', '').toUpperCase()}
          onFocus={(e) => {
            setDraft(value.replace('#', '').toUpperCase());
            e.currentTarget.select();
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setDraft(null);
              e.currentTarget.blur();
            }
          }}
          data-value-field
          className="w-full min-w-0 bg-transparent uppercase tabular-nums outline-none select-text"
        />
      </span>
      {at && (
        <Popover title="Colour" at={at} onClose={() => setAt(null)} width={280}>
          <ColorPicker value={value} onChange={onChange} />
        </Popover>
      )}
    </>
  );
}

// Saturation/brightness square, hue strip, previous/new swatches, and the
// colour as hex, RGB and HSL.
function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [previous] = useState(value);
  const rgb = toRgb(value);
  // Hue is kept apart so it survives dragging through greys and black.
  const [hsv, setHsv] = useState<RGB>(() => rgbToHsv(rgb));
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const set = (next: RGB) => {
    setHsv(next);
    onChange(toHex(hsvToRgb(next)));
  };
  const setRgb = (next: RGB) => {
    const h = rgbToHsv(next);
    setHsv([h[1] === 0 || h[2] === 0 ? hsv[0] : h[0], h[1], h[2]]);
    onChange(toHex(next));
  };
  const drag = (
    e: React.PointerEvent<HTMLDivElement>,
    at: (x: number, y: number) => void,
  ) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const go = (m: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      at(
        clamp01((m.clientX - r.left) / r.width),
        clamp01((m.clientY - r.top) / r.height),
      );
    };
    go(e);
    const up = () => {
      el.removeEventListener('pointermove', go);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', go);
    el.addEventListener('pointerup', up);
  };
  const hsl = rgbToHsl(rgb);
  const triple = (
    labels: string,
    vals: number[],
    max: number[],
    onSet: (i: number, v: number) => void,
  ) => (
    <div className="grid grid-cols-3 gap-1">
      {vals.map((v, i) => (
        <NumberField
          key={labels[i] + i}
          value={Math.round(v)}
          onChange={(x) => onSet(i, x)}
          min={0}
          max={max[i]}
          step={1}
          prefix={labels[i]}
        />
      ))}
    </div>
  );
  return (
    <div className="space-y-2 p-3">
      <div className="flex gap-2">
        <div
          onPointerDown={(e) => drag(e, (x, y) => set([hsv[0], x, 1 - y]))}
          className="relative h-40 flex-1 cursor-crosshair rounded-md"
          style={{
            background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv[0]} 100% 50%))`,
          }}
        >
          <span
            className="pointer-events-none absolute size-3 -translate-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.3)]"
            style={{
              left: `${hsv[1] * 100}%`,
              top: `${(1 - hsv[2]) * 100}%`,
              background: value,
            }}
          />
        </div>
        <div
          onPointerDown={(e) =>
            drag(e, (_x, y) => set([y * 359.9, hsv[1], hsv[2]]))
          }
          className="relative h-40 w-3.5 cursor-ns-resize rounded-md"
          style={{
            background:
              'linear-gradient(to bottom, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
          }}
        >
          <span
            className="pointer-events-none absolute inset-x-[-2px] h-2 -translate-y-1/2 rounded-sm border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.3)]"
            style={{ top: `${(hsv[0] / 360) * 100}%` }}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 overflow-hidden rounded-md border border-black/10 text-center text-[10px] text-neutral-500">
        <button
          title="Back to the previous colour"
          onClick={() => setRgb(toRgb(previous))}
          className="h-7"
          style={{ background: previous }}
        />
        <span className="h-7" style={{ background: value }} />
      </div>
      <div className="grid grid-cols-2 text-center text-[10px] text-neutral-400">
        <span>Previous</span>
        <span>New</span>
      </div>
      <label className={`${FIELD} flex items-center gap-1.5 px-1.5`}>
        <span className="text-neutral-400">#</span>
        <input
          value={hexDraft ?? value.replace('#', '').toUpperCase()}
          onFocus={(e) => {
            setHexDraft(value.replace('#', '').toUpperCase());
            e.currentTarget.select();
          }}
          onChange={(e) => setHexDraft(e.target.value)}
          onBlur={() => {
            const h = (hexDraft ?? '').replace(/[^0-9a-f]/gi, '');
            if (h.length === 3 || h.length === 6)
              setRgb(toRgb(h.length === 3 ? h.replace(/./g, '$&$&') : h));
            setHexDraft(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          data-value-field
          className="w-full min-w-0 bg-transparent uppercase tabular-nums outline-none select-text"
        />
      </label>
      {triple('RGB', rgb, [255, 255, 255], (i, v) => {
        const next = [...rgb] as RGB;
        next[i] = v;
        setRgb(next);
      })}
      {triple(
        'HSL',
        [hsl[0], hsl[1] * 100, hsl[2] * 100],
        [359, 100, 100],
        (i, v) => {
          const next = [hsl[0], hsl[1], hsl[2]] as RGB;
          next[i] = i === 0 ? v : v / 100;
          setRgb(hslToRgb(next));
        },
      )}
    </div>
  );
}

// The top of the right panel, the same for a page, layer, folder or
// selection: a bold title, a grey second line, and any actions on the right.
export function PanelHeader({
  title,
  meta,
  aside,
}: {
  title: React.ReactNode;
  meta: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-0.5 border-b border-black/6 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-neutral-900">
          {title}
        </p>
        <p className="mt-0.5 truncate text-neutral-500">{meta}</p>
      </div>
      {aside}
    </div>
  );
}
