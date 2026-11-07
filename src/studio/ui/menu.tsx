import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FIELD, sentence } from './shared';

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
  preview,
}: {
  anchor: DOMRect;
  // The button that opened it: a press there is left to the button, which
  // closes the menu itself, rather than closing and reopening it.
  trigger?: Element | null;
  options: MenuOption[];
  value?: string;
  onPick: (v: string) => void;
  onClose: () => void;
  // A picture of the highlighted choice, shown beside the menu.
  preview?: (value: string) => React.ReactNode;
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
  // The preview sits to the menu's left (the panel is on the right).
  const [box, setBox] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (preview && el.current) setBox(el.current.getBoundingClientRect());
  }, [preview, left]);
  const shown = preview && hi >= 0 ? preview(picks[hi].value) : null;
  return createPortal(
    <>
      {shown && box && (
        <div
          className="pointer-events-none fixed z-[70] w-40 overflow-hidden rounded-lg border border-black/10 bg-white shadow-[0_8px_28px_rgb(0_0_0/0.18)]"
          style={{ left: Math.max(8, box.left - 168), top: box.top }}
        >
          {shown}
        </div>
      )}
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
            return (
              <div key={`sep-${k}`} className="mx-2 my-1 h-px bg-black/8" />
            );
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
      </div>
    </>,
    document.querySelector('.studio') ?? document.body,
  );
}

export function SelectField({
  value,
  options,
  onChange,
  className = '',
  preview,
}: {
  value: string;
  options: MenuOption[];
  onChange: (v: string) => void;
  className?: string;
  preview?: (value: string) => React.ReactNode;
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
          preview={preview}
          options={options.map(label)}
          value={value}
          onPick={onChange}
          onClose={() => setAt(null)}
        />
      )}
    </>
  );
}
