import { useState } from 'react';
import { announcePopover, popoverAt, useOnOtherPopover } from '../tools';
import { FIELD } from './shared';
import { NumberField } from './basics';
import { Popover } from './popover';

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
export function ColorPicker({
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
