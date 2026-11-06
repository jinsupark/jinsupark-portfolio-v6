import {
  CircleDashed,
  Contrast,
  Droplet,
  Eye,
  EyeOff,
  Feather,
  Grid2x2,
  Layers,
  Minus,
  Plus,
  ScanLine,
  Scissors,
  SlidersHorizontal,
  SunMoon,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { defaultsOf, fit } from '@/lab/controls';
import {
  layerId,
  newFilter,
  newOutline,
  newShadow,
  newStroke,
  type ExportDoc,
  type FilterDoc,
  type OutlineDoc,
  type ShadowDoc,
  type StrokeDoc,
} from './document';
import FillList, { AddMenu, Swatch } from './Fills';
import type { LayerType } from './layer';
import {
  FILTERS,
  filterInputSchema,
  OUTLINES,
  shadowSchema,
  strokeSchema,
  STROKES,
} from './studioSchemas';
import { blendOptions, popoverAt } from './tools';
import {
  IconButton,
  Labeled,
  NumberField,
  Popover,
  Row,
  Rows,
  Section,
  SelectField,
  SortableList,
} from './ui';

type At = { id: string; top: number; left: number };

const strokeOptions = Object.entries(STROKES).map(([value, s]) => ({
  value,
  label: s.label,
}));
const ALIGN_LABELS: Record<string, string> = {
  inside: 'Inside',
  center: 'Centre',
  outside: 'Outside',
};

// Patch one item of a list by id.
const patchIn = <T extends { id: string }>(
  list: T[],
  id: string,
  p: Partial<T>,
) => list.map((x) => (x.id === id ? { ...x, ...p } : x));

function VisibleToggle({
  on,
  onToggle,
  what,
}: {
  on: boolean;
  onToggle: () => void;
  what: string;
}) {
  return (
    <IconButton
      title={on ? `Hide ${what}` : `Show ${what}`}
      onClick={onToggle}
      className="size-5!"
    >
      {on ? <Eye size={12} /> : <EyeOff size={12} />}
    </IconButton>
  );
}

function Remove({ onClick, what }: { onClick: () => void; what: string }) {
  return (
    <IconButton title={`Remove ${what}`} onClick={onClick} className="size-5!">
      <Minus size={12} />
    </IconButton>
  );
}

// Bands along the shape's edge, each painted with its own fills.
export function StrokeList({
  strokes,
  onStrokes,
  types,
}: {
  strokes: StrokeDoc[];
  onStrokes: (next: StrokeDoc[]) => void;
  types: Record<string, LayerType>;
}) {
  const [open, setOpen] = useState<At | null>(null);
  const current = open && strokes.find((s) => s.id === open.id);
  const patch = (id: string, p: Partial<StrokeDoc>) =>
    onStrokes(patchIn(strokes, id, p));
  return (
    <Section
      id="insp:Border"
      title="Border"
      aside={
        <AddMenu
          title="Add a border"
          options={strokeOptions}
          onPick={(type, el) => {
            const s = newStroke(type);
            onStrokes([...strokes, s]);
            setOpen({ id: s.id, ...popoverAt(el) });
          }}
        />
      }
    >
      {strokes.length > 0 && (
        <SortableList
          items={strokes}
          onItems={onStrokes}
          active={open?.id}
          row={(s) => (
            <>
              <button
                onClick={(e) =>
                  open?.id === s.id
                    ? setOpen(null)
                    : setOpen({ id: s.id, ...popoverAt(e.currentTarget) })
                }
                className={`flex min-w-0 flex-1 items-center gap-1.5 self-stretch text-left ${s.visible ? 'text-neutral-800' : 'text-neutral-400'}`}
              >
                <Swatch f={s.fills.at(-1)} />
                <span className="truncate">
                  {STROKES[s.type]?.label ?? s.type}
                </span>
                <span className="shrink-0 text-neutral-400">
                  {ALIGN_LABELS[s.align]}
                  {s.sides && s.sides !== 'all' ? ` · ${s.sides}` : ''}
                </span>
              </button>
              <NumberField
                value={s.width}
                onChange={(width) => patch(s.id, { width })}
                min={0.1}
                max={80}
                step={0.1}
                prefix={<CircleDashed size={11} />}
                className="w-16 shrink-0"
              />
              <VisibleToggle
                on={s.visible}
                what="border"
                onToggle={() => patch(s.id, { visible: !s.visible })}
              />
              <Remove
                what="border"
                onClick={() => onStrokes(strokes.filter((x) => x.id !== s.id))}
              />
            </>
          )}
        />
      )}
      {open && current && (
        <Popover
          key={current.id}
          title={STROKES[current.type]?.label ?? 'Border'}
          at={open}
          onClose={() => setOpen(null)}
        >
          <div className="space-y-1.5 border-b border-black/6 p-3">
            <Labeled label="border">
              <SelectField
                value={current.type}
                options={strokeOptions}
                onChange={(type) => {
                  const fresh = newStroke(type);
                  // Fibres start from their own default amount.
                  patch(current.id, {
                    type,
                    ...(type === 'fibres' &&
                      !(current.fibers > 0) && { fibers: fresh.fibers }),
                  });
                }}
              />
            </Labeled>
            <Rows
              schema={{ ...strokeSchema, ...STROKES[current.type]?.schema }}
              values={{ sides: 'all', ...current }}
              onChange={(k, v) => patch(current.id, { [k]: v })}
            />
            <Labeled label="opacity">
              <NumberField
                value={current.opacity}
                onChange={(opacity) => patch(current.id, { opacity })}
                min={0}
                max={1}
                step={0.01}
                factor={100}
                suffix="%"
              />
            </Labeled>
            <Labeled label="blend">
              <SelectField
                value={current.blend}
                options={blendOptions}
                onChange={(v) =>
                  patch(current.id, { blend: v as StrokeDoc['blend'] })
                }
              />
            </Labeled>
          </div>
          <FillList
            fills={current.fills}
            onFills={(fills) => patch(current.id, { fills })}
            types={types}
            title="Paint"
            id="insp:StrokePaint"
          />
        </Popover>
      )}
    </Section>
  );
}

// The shape, offset and softened, under the layer.
export function ShadowList({
  shadows,
  onShadows,
}: {
  shadows: ShadowDoc[];
  onShadows: (next: ShadowDoc[]) => void;
}) {
  const [open, setOpen] = useState<At | null>(null);
  const current = open && shadows.find((s) => s.id === open.id);
  const patch = (id: string, p: Partial<ShadowDoc>) =>
    onShadows(patchIn(shadows, id, p));
  return (
    <Section
      id="insp:Shadow"
      title="Shadow"
      aside={
        <IconButton
          title="Add a shadow"
          onClick={() => onShadows([...shadows, newShadow()])}
        >
          <Plus size={13} />
        </IconButton>
      }
    >
      {shadows.length > 0 && (
        <SortableList
          items={shadows}
          onItems={onShadows}
          active={open?.id}
          row={(s) => (
            <>
              <button
                onClick={(e) =>
                  open?.id === s.id
                    ? setOpen(null)
                    : setOpen({ id: s.id, ...popoverAt(e.currentTarget) })
                }
                className={`flex min-w-0 flex-1 items-center gap-1.5 self-stretch text-left ${s.visible ? 'text-neutral-800' : 'text-neutral-400'}`}
              >
                <span
                  className="size-4 shrink-0 rounded-[3px] border border-black/15"
                  style={{ background: s.color }}
                />
                <span className="truncate">Drop shadow</span>
              </button>
              <NumberField
                value={s.opacity}
                onChange={(opacity) => patch(s.id, { opacity })}
                min={0}
                max={1}
                step={0.01}
                factor={100}
                suffix="%"
                className="w-14 shrink-0"
              />
              <VisibleToggle
                on={s.visible}
                what="shadow"
                onToggle={() => patch(s.id, { visible: !s.visible })}
              />
              <Remove
                what="shadow"
                onClick={() => onShadows(shadows.filter((x) => x.id !== s.id))}
              />
            </>
          )}
        />
      )}
      {open && current && (
        <Popover
          key={current.id}
          title="Drop shadow"
          at={open}
          onClose={() => setOpen(null)}
        >
          <div className="space-y-1.5 p-3">
            <Rows
              schema={shadowSchema}
              values={current}
              onChange={(k, v) => patch(current.id, { [k]: v })}
            />
          </div>
        </Popover>
      )}
    </Section>
  );
}

const FILTER_ICONS: Record<string, LucideIcon> = {
  blur: Droplet,
  pixelate: Grid2x2,
  mono: Contrast,
  invert: SunMoon,
  posterize: Layers,
  threshold: Contrast,
  dither: ScanLine,
};

const filterOptions = Object.entries(FILTERS).map(([value, f]) => ({
  value,
  label: f.label,
}));

// Filters on the layer's fills, or on the artwork behind the layer, in order.
// Each row is its type and main value, like Paper's; the sliders button opens
// the rest.
export function FilterList({
  filters,
  onFilters,
}: {
  filters: FilterDoc[];
  onFilters: (next: FilterDoc[]) => void;
}) {
  const [open, setOpen] = useState<At | null>(null);
  const current = open && filters.find((f) => f.id === open.id);
  const patch = (id: string, p: Partial<FilterDoc>) =>
    onFilters(patchIn(filters, id, p));
  const valuesOf = (f: FilterDoc) => {
    const schema = FILTERS[f.type]?.schema ?? {};
    return { ...defaultsOf(schema), ...fit(f.values, schema) };
  };
  return (
    <Section
      id="insp:Filters"
      title="Filters"
      aside={
        <AddMenu
          title="Add a filter"
          options={filterOptions}
          onPick={(type) =>
            onFilters([
              ...filters,
              newFilter(type, defaultsOf(FILTERS[type].schema)),
            ])
          }
        />
      }
    >
      {filters.length > 0 && (
        <SortableList
          items={filters}
          onItems={onFilters}
          active={open?.id}
          row={(f) => {
            const def = FILTERS[f.type];
            const Icon = FILTER_ICONS[f.type] ?? SlidersHorizontal;
            const v = valuesOf(f);
            const main = def?.main;
            const control = main ? def.schema[main] : undefined;
            return (
              <>
                <button
                  onClick={(e) =>
                    open?.id === f.id
                      ? setOpen(null)
                      : setOpen({ id: f.id, ...popoverAt(e.currentTarget) })
                  }
                  className={`flex min-w-0 flex-1 items-center gap-1.5 self-stretch text-left ${f.visible ? 'text-neutral-800' : 'text-neutral-400'}`}
                >
                  <Icon
                    size={14}
                    strokeWidth={1.75}
                    className="shrink-0 text-neutral-500"
                  />
                  <span className="truncate">{def?.label ?? f.type}</span>
                  {f.input === 'background' && (
                    <span className="shrink-0 text-neutral-400">behind</span>
                  )}
                </button>
                {control?.kind === 'range' && (
                  <NumberField
                    value={Number(v[main!])}
                    onChange={(x) =>
                      patch(f.id, { values: { ...v, [main!]: x } })
                    }
                    min={control.min}
                    max={control.max}
                    step={control.step}
                    className="w-14 shrink-0"
                  />
                )}
                <VisibleToggle
                  on={f.visible}
                  what="filter"
                  onToggle={() => patch(f.id, { visible: !f.visible })}
                />
                <Remove
                  what="filter"
                  onClick={() =>
                    onFilters(filters.filter((x) => x.id !== f.id))
                  }
                />
              </>
            );
          }}
        />
      )}
      {open && current && (
        <Popover
          key={current.id}
          title={FILTERS[current.type]?.label ?? current.type}
          at={open}
          onClose={() => setOpen(null)}
        >
          <div className="space-y-1.5 p-3">
            <Labeled label="filter">
              <SelectField
                value={current.type}
                options={filterOptions}
                onChange={(type) =>
                  patch(current.id, {
                    type,
                    values: defaultsOf(FILTERS[type].schema),
                  })
                }
              />
            </Labeled>
            <Row
              name="input"
              control={filterInputSchema}
              value={current.input}
              onChange={(input) =>
                patch(current.id, { input: input as FilterDoc['input'] })
              }
            />
            <Rows
              schema={FILTERS[current.type]?.schema ?? {}}
              values={valuesOf(current)}
              onChange={(k, x) =>
                patch(current.id, {
                  values: { ...valuesOf(current), [k]: x },
                })
              }
            />
            {current.input === 'background' && (
              <p className="text-neutral-400">
                Works on the artwork behind this layer, inside its shape.
              </p>
            )}
          </div>
        </Popover>
      )}
    </Section>
  );
}

const SCALES = [0.5, 1, 2, 3, 4].map((s) => ({
  value: String(s),
  label: `${s}x`,
}));
const FORMATS = [
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPG' },
];

// Export presets, like Paper's: scale and format per row, one button for all.
export function ExportSection({
  exports,
  onExports,
  onExport,
  busy,
}: {
  exports: ExportDoc[];
  onExports: (next: ExportDoc[]) => void;
  onExport: () => void;
  busy: boolean;
}) {
  const patch = (id: string, p: Partial<ExportDoc>) =>
    onExports(patchIn(exports, id, p));
  return (
    <Section
      id="studio:export"
      title="Export"
      aside={
        <IconButton
          title="Add an export size"
          onClick={() =>
            onExports([
              ...exports,
              {
                id: layerId(),
                scale: Math.min(4, (exports.at(-1)?.scale ?? 1) + 1),
                format: exports.at(-1)?.format ?? 'png',
              },
            ])
          }
        >
          <Plus size={13} />
        </IconButton>
      }
    >
      {exports.map((e) => (
        <div key={e.id} className="flex items-center gap-1.5">
          <SelectField
            value={String(e.scale)}
            options={SCALES}
            onChange={(v) => patch(e.id, { scale: Number(v) })}
            className="min-w-0 flex-1"
          />
          <SelectField
            value={e.format}
            options={FORMATS}
            onChange={(v) => patch(e.id, { format: v as ExportDoc['format'] })}
            className="min-w-0 flex-1"
          />
          <Remove
            what="export size"
            onClick={() => onExports(exports.filter((x) => x.id !== e.id))}
          />
        </div>
      ))}
      <button
        onClick={onExport}
        disabled={busy || exports.length === 0}
        className="flex h-7 w-full items-center justify-center gap-2 rounded-md border border-black/10 bg-white font-medium text-neutral-800 shadow-[0_1px_0_rgb(0_0_0/0.02)] hover:bg-neutral-50 disabled:text-neutral-400"
      >
        {busy ? 'Exporting…' : 'Export'}
        {!busy && <span className="font-normal text-neutral-400">⇧⌘E</span>}
      </button>
    </Section>
  );
}

const OUTLINE_ICONS: Record<string, LucideIcon> = {
  tear: Scissors,
  feather: Feather,
};
const outlineOptions = Object.entries(OUTLINES).map(([value, o]) => ({
  value,
  label: o.label,
}));

// The Shape section: the shape's own settings (`children`), then changes to
// the outline added with + — tears (which stack) and feathers. Each row is
// its type and amount; the sliders button opens the rest.
export function ShapeSection({
  outline,
  onOutline,
  children,
}: {
  outline: OutlineDoc[];
  onOutline: (next: OutlineDoc[]) => void;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState<At | null>(null);
  const current = open && outline.find((o) => o.id === open.id);
  const patch = (id: string, p: Partial<OutlineDoc>) =>
    onOutline(patchIn(outline, id, p));
  const valuesOf = (o: OutlineDoc) => {
    const schema = OUTLINES[o.type]?.schema ?? {};
    return { ...defaultsOf(schema), ...fit(o.values, schema) };
  };
  return (
    <Section
      id="insp:Shape"
      title="Shape"
      aside={
        <AddMenu
          title="Add to the outline"
          options={outlineOptions}
          onPick={(type, el) => {
            const o = newOutline(type, defaultsOf(OUTLINES[type].schema));
            onOutline([...outline, o]);
            setOpen({ id: o.id, ...popoverAt(el) });
          }}
        />
      }
    >
      {children}
      {outline.length > 0 && (
        <SortableList
          items={outline}
          onItems={onOutline}
          active={open?.id}
          row={(o) => {
            const def = OUTLINES[o.type];
            const Icon = OUTLINE_ICONS[o.type] ?? SlidersHorizontal;
            const v = valuesOf(o);
            const control = def?.schema[def.main];
            return (
              <>
                <span
                  className={`flex min-w-0 flex-1 items-center gap-1.5 ${o.visible ? 'text-neutral-800' : 'text-neutral-400'}`}
                >
                  <Icon
                    size={13}
                    strokeWidth={1.75}
                    className="shrink-0 text-neutral-500"
                  />
                  <span className="truncate">{def?.label ?? o.type}</span>
                </span>
                {control?.kind === 'range' && (
                  <NumberField
                    value={Number(v[def.main])}
                    onChange={(x) =>
                      patch(o.id, { values: { ...v, [def.main]: x } })
                    }
                    min={control.min}
                    max={control.max}
                    step={control.step}
                    className="w-16 shrink-0"
                  />
                )}
                {def && Object.keys(def.schema).length > 1 ? (
                  <IconButton
                    title={`${def.label} settings`}
                    active={open?.id === o.id}
                    onClick={(e) =>
                      open?.id === o.id
                        ? setOpen(null)
                        : setOpen({ id: o.id, ...popoverAt(e.currentTarget) })
                    }
                    className="size-5!"
                  >
                    <SlidersHorizontal size={12} />
                  </IconButton>
                ) : (
                  <span className="size-5 shrink-0" />
                )}
                <VisibleToggle
                  on={o.visible}
                  what={def?.label.toLowerCase() ?? 'effect'}
                  onToggle={() => patch(o.id, { visible: !o.visible })}
                />
                <Remove
                  what={def?.label.toLowerCase() ?? 'effect'}
                  onClick={() =>
                    onOutline(outline.filter((x) => x.id !== o.id))
                  }
                />
              </>
            );
          }}
        />
      )}
      {open && current && (
        <Popover
          key={current.id}
          title={OUTLINES[current.type]?.label ?? current.type}
          at={open}
          onClose={() => setOpen(null)}
        >
          <div className="space-y-1.5 p-3">
            <Rows
              schema={OUTLINES[current.type]?.schema ?? {}}
              values={valuesOf(current)}
              onChange={(k, x) =>
                patch(current.id, { values: { ...valuesOf(current), [k]: x } })
              }
            />
          </div>
        </Popover>
      )}
    </Section>
  );
}
