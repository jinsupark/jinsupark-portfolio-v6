import { RotateCcw } from 'lucide-react';
import { Children, useEffect, useRef, useState } from 'react';
import { type Control } from '@/lab/controls';
import { FIELD, sentence, digitsOf, rangeOf } from './shared';

// A titled block, always open.
export function Section({
  title,
  aside,
  onReset,
  children,
}: {
  title: React.ReactNode;
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
