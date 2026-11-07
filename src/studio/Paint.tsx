import {
  Blend,
  Dices,
  Film,
  Image as ImageIcon,
  Sparkles,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { defaultsOf, fit } from '@/lab/controls';
import type { FillDoc } from './document';
import type { LayerType } from './layer';
import {
  formatStops,
  gradientCss,
  isMediaFile,
  isVideoFile,
  parseStops,
  uploadAsset,
  type Stop,
} from './paints';
import { shaderThumb } from './shaders';
import { fillSpaceSchema } from './studioSchemas';
import { blendOptions, resetGroup } from './tools';
import {
  ColorPicker,
  ControlGroups,
  IconButton,
  Labeled,
  NumberField,
  Popover,
  Row,
  Rows,
  SelectField,
} from './ui';

type Tab = 'solid' | 'gradient' | 'image' | 'video' | 'shader';
const TABS: { id: Tab; label: string; Icon: typeof Square }[] = [
  { id: 'solid', label: 'Solid', Icon: Square },
  { id: 'gradient', label: 'Gradient', Icon: Blend },
  { id: 'image', label: 'Image', Icon: ImageIcon },
  { id: 'video', label: 'Video', Icon: Film },
  { id: 'shader', label: 'Shader', Icon: Sparkles },
];

const randomSeed = () => 1 + Math.floor(Math.random() * 999);

// A paint's colour, best guess, to carry across a change of tab.
function colourOf(f: FillDoc) {
  const v = f.values as Record<string, string>;
  if (f.type === 'solid') return v.color;
  if (f.type === 'gradient') return parseStops(v.stops ?? '')[0].color;
  return '#3d2b33';
}

// What a fill or a border is painted with, like Figma's paint picker: tabs
// for a solid colour, a multi-stop gradient, an image, a video or a shader,
// and that kind's settings underneath.
export default function PaintPopover({
  fill,
  types,
  at,
  title = 'Paint',
  onPatch,
  onRetype,
  onClose,
  extra,
}: {
  fill: FillDoc;
  types: Record<string, LayerType>;
  at: { top: number; left: number };
  title?: string;
  onPatch: (p: Partial<FillDoc>) => void;
  onRetype?: (
    fill: FillDoc,
    from: LayerType | undefined,
    to: LayerType,
  ) => void;
  onClose: () => void;
  // More settings under the paint's (a border's width, position…).
  extra?: React.ReactNode;
}) {
  const t = types[fill.type];
  const tab: Tab = t?.paint ?? 'shader';
  const schema = t?.schema ?? {};
  const values = { ...defaultsOf(schema), ...fit(fill.values, schema) };
  const set = (k: string, v: unknown) =>
    onPatch({ values: { ...values, [k]: v } });

  const switchTo = (type: string, carry: Record<string, unknown> = {}) => {
    const next = types[type];
    if (!next || type === fill.type) return;
    onRetype?.(fill, t, next);
    onPatch({
      type,
      version: next.version,
      values: { ...next.initial(), ...carry },
    });
  };
  const pickTab = (id: Tab) => {
    if (id === tab) return;
    const c = colourOf(fill);
    if (id === 'solid') switchTo('solid', { color: c });
    else if (id === 'gradient')
      switchTo('gradient', {
        stops: formatStops([
          { color: c, at: 0 },
          { color: '#fcdbe5', at: 1 },
        ]),
      });
    else if (id === 'image') switchTo('image');
    else if (id === 'video') switchTo('video');
    else {
      const first = Object.values(types).find((x) => !x.paint);
      if (first) switchTo(first.type);
    }
  };

  return (
    <Popover
      title={title}
      at={at}
      onClose={onClose}
      width={280}
      actions={
        tab === 'shader' &&
        t &&
        'seed' in t.schema && (
          <IconButton title="Re-seed" onClick={() => set('seed', randomSeed())}>
            <Dices size={12} />
          </IconButton>
        )
      }
    >
      <div className="flex items-center gap-0.5 border-b border-black/6 px-2 py-1.5">
        {TABS.map(({ id, label, Icon }) => (
          <IconButton
            key={id}
            title={label}
            active={tab === id}
            onClick={() => pickTab(id)}
            className="size-7!"
          >
            <Icon size={14} strokeWidth={1.75} />
          </IconButton>
        ))}
      </div>

      {tab === 'solid' && (
        <ColorPicker
          value={String(values.color)}
          onChange={(c) => set('color', c)}
        />
      )}
      {tab === 'gradient' && <GradientEditor values={values} onChange={set} />}
      {(tab === 'image' || tab === 'video') && (
        <MediaEditor
          video={tab === 'video'}
          schema={schema}
          values={values}
          onChange={set}
        />
      )}
      {tab === 'shader' && (
        <>
          <div className="border-b border-black/6 p-3">
            <Labeled label="shader">
              <SelectField
                value={fill.type}
                options={Object.values(types)
                  .filter((x) => !x.paint)
                  .map((x) => ({ value: x.type, label: x.label }))}
                onChange={(type) => switchTo(type)}
                preview={(type) =>
                  types[type] && (
                    <div className="aspect-4/5 bg-neutral-200">
                      <Thumb t={types[type]} />
                    </div>
                  )
                }
              />
            </Labeled>
          </div>
          {t ? (
            <ControlGroups
              schema={schema}
              values={values}
              onChange={set}
              onReset={(g) =>
                onPatch({ values: resetGroup(schema, values, g) })
              }
            />
          ) : (
            <p className="p-3 text-red-500">
              This fill's type ({fill.type}) isn't available.
            </p>
          )}
        </>
      )}

      {extra}
      <div className="space-y-1.5 border-t border-black/6 p-3">
        {!t?.shapeStyle && (
          <Row
            name="fillSpace"
            control={fillSpaceSchema}
            value={fill.fillSpace ?? 'shape'}
            onChange={(v) => onPatch({ fillSpace: v as FillDoc['fillSpace'] })}
          />
        )}
        <Labeled label="blend">
          <SelectField
            value={fill.blend}
            options={blendOptions}
            onChange={(v) => onPatch({ blend: v as FillDoc['blend'] })}
          />
        </Labeled>
      </div>
    </Popover>
  );
}

// Linear or radial; a bar of stops to drag, click to add one, and the picked
// stop's colour below.
function GradientEditor({
  values,
  onChange,
}: {
  values: Record<string, unknown>;
  onChange: (k: string, v: unknown) => void;
}) {
  const stops = parseStops(String(values.stops ?? ''));
  const [picked, setPicked] = useState(0);
  const sel = Math.min(picked, stops.length - 1);
  const bar = useRef<HTMLDivElement>(null);
  const write = (next: Stop[]) => onChange('stops', formatStops(next));
  const atOf = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };
  // Stops keep their identity while dragged past each other: indexes are
  // into this order, re-sorted only when written.
  const drag = (e: React.PointerEvent, i: number) => {
    e.stopPropagation();
    setPicked(i);
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => {
      const next = stops.map((s, k) =>
        k === i ? { ...s, at: atOf(m.clientX) } : s,
      );
      onChange(
        'stops',
        next.map((s) => `${s.color} ${+s.at.toFixed(3)}`).join(', '),
      );
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  return (
    <div className="space-y-2 border-b border-black/6 p-3">
      <div className="grid grid-cols-2 gap-1.5">
        <SelectField
          value={String(values.kind)}
          options={[
            { value: 'linear', label: 'Linear' },
            { value: 'radial', label: 'Radial' },
          ]}
          onChange={(v) => onChange('kind', v)}
        />
        {values.kind !== 'radial' && (
          <NumberField
            value={Number(values.angle)}
            onChange={(v) => onChange('angle', v)}
            min={0}
            max={360}
            step={1}
            suffix="°"
          />
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <div
          ref={bar}
          onPointerDown={(e) => {
            // A click on the bar adds a stop there, in the colour it shows.
            const at = atOf(e.clientX);
            const next = [...stops, { color: stops[sel].color, at }];
            write(next);
            setPicked(
              next.sort((a, b) => a.at - b.at).findIndex((s) => s.at === at),
            );
          }}
          className="relative h-6 flex-1 cursor-copy rounded-md border border-black/10"
          style={{ background: gradientCss(values, 90) }}
        >
          {stops.map((s, i) => (
            <span
              key={i}
              onPointerDown={(e) => drag(e, i)}
              className={`absolute top-1/2 size-4 -translate-1/2 cursor-ew-resize rounded-[4px] border-2 shadow-[0_0_0_1px_rgb(0_0_0/0.25)] ${i === sel ? 'border-sky-500' : 'border-[#fff]'}`}
              style={{ left: `${s.at * 100}%`, background: s.color }}
            />
          ))}
        </div>
        <IconButton
          title="Remove stop"
          onClick={() => {
            if (stops.length <= 2) return;
            write(stops.filter((_, k) => k !== sel));
            setPicked(Math.max(0, sel - 1));
          }}
          className={stops.length <= 2 ? 'pointer-events-none opacity-40' : ''}
        >
          <Trash2 size={12} />
        </IconButton>
      </div>
      <div className="-mx-3 -mb-3">
        <ColorPicker
          key={sel}
          value={stops[sel].color}
          onChange={(c) =>
            write(stops.map((s, k) => (k === sel ? { ...s, color: c } : s)))
          }
        />
      </div>
    </div>
  );
}

// An image or video: its preview (drop a file on it, or choose one), then how
// it sits in the shape.
function MediaEditor({
  video,
  schema,
  values,
  onChange,
}: {
  video: boolean;
  schema: Record<string, unknown>;
  values: Record<string, unknown>;
  onChange: (k: string, v: unknown) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const src = String(values.src ?? '');
  const take = async (f?: File | null) => {
    if (!f || !isMediaFile(f) || isVideoFile(f) !== video) return;
    setBusy(true);
    onChange('src', await uploadAsset(f, f.name));
    setBusy(false);
  };
  const rest = Object.fromEntries(
    Object.entries(schema).filter(([k]) => k !== 'src'),
  ) as Parameters<typeof Rows>[0]['schema'];
  return (
    <div className="space-y-2 border-b border-black/6 p-3">
      <button
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void take(e.dataTransfer.files[0]);
        }}
        className={`relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border border-dashed ${over ? 'border-sky-500 bg-sky-500/8' : 'border-black/15 bg-black/3'}`}
      >
        {src ? (
          video ? (
            <video
              src={src}
              muted
              loop
              autoPlay
              playsInline
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <img
              src={src}
              alt=""
              className="absolute inset-0 size-full object-cover"
            />
          )
        ) : (
          <span className="flex flex-col items-center gap-1 text-neutral-500">
            <Upload size={16} />
            {busy
              ? 'Adding…'
              : `Choose or drop ${video ? 'a video' : 'an image'}`}
          </span>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept={video ? 'video/*' : 'image/*'}
        className="hidden"
        onChange={(e) => void take(e.target.files?.[0])}
      />
      {src && (
        <p className="truncate text-neutral-400">{src.split('/').pop()}</p>
      )}
      <Rows schema={rest} values={values} onChange={onChange} />
    </div>
  );
}

// A shader's thumbnail, rendered once per session.
function Thumb({ t }: { t: LayerType }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    shaderThumb(t).then(
      (u) => live && setSrc(u),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [t]);
  return src ? (
    <img src={src} alt="" className="size-full object-cover" />
  ) : null;
}
