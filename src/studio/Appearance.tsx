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
  Waves,
  type LucideIcon,
} from 'lucide-react';
import { defaultsOf, fit } from '@/lab/controls';
import {
  layerId,
  newFilter,
  newOutline,
  isVideo,
  newShadow,
  newStroke,
  type ExportDoc,
  type FilterDoc,
  type OutlineDoc,
  type ShadowDoc,
  type StrokeDoc,
} from './document';
import { AddMenu, Swatch } from './Fills';
import PaintPopover from './Paint';
import type { LayerType } from './layer';
import {
  FILTERS,
  filterInputSchema,
  OUTLINES,
  shadowSchema,
  strokeSchema,
  STROKES,
} from './studioSchemas';
import { usePopovers } from './tools';
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
    <IconButton title={`Remove ${what}`} onClick={onClick}>
      <Minus size={13} />
    </IconButton>
  );
}

// Bands along the shape's edge. A border's popover is the paint picker, with
// its width, position, sides and fibres underneath.
export function StrokeList({
  strokes,
  onStrokes,
  types,
}: {
  strokes: StrokeDoc[];
  onStrokes: (next: StrokeDoc[]) => void;
  types: Record<string, LayerType>;
}) {
  const pop = usePopovers();
  const patch = (id: string, p: Partial<StrokeDoc>) =>
    onStrokes(patchIn(strokes, id, p));
  return (
    <ItemList
      title="Border"
      what={() => 'border'}
      items={strokes}
      onItems={onStrokes}
      add={() => (
        <AddMenu
          title="Add a border"
          options={strokeOptions}
          onPick={(type, el) => {
            const s = newStroke(type);
            onStrokes([...strokes, s]);
            pop.openAt(s.id, el);
          }}
        />
      )}
      row={(s) => (
        <>
          <RowLabel visible={s.visible} onOpen={(el) => pop.toggle(s.id, el)}>
            <Swatch f={s.fills[0]} />
            <span className="truncate">{STROKES[s.type]?.label ?? s.type}</span>
            <span className="shrink-0 text-neutral-400">
              {ALIGN_LABELS[s.align]}
              {s.sides && s.sides !== 'all' ? ` · ${s.sides}` : ''}
            </span>
          </RowLabel>
          <NumberField
            value={s.width}
            onChange={(width) => patch(s.id, { width })}
            min={0.1}
            max={80}
            step={0.1}
            prefix={<CircleDashed size={11} />}
            className="w-16 shrink-0"
          />
        </>
      )}
    >
      {pop.opens.map((open) => {
        const s = strokes.find((x) => x.id === open.id);
        const fill = s?.fills[0];
        return (
          s &&
          fill && (
            <PaintPopover
              key={s.id}
              title={STROKES[s.type]?.label ?? 'Border'}
              fill={fill}
              types={types}
              at={open}
              onPatch={(p) => patch(s.id, { fills: [{ ...fill, ...p }] })}
              onClose={() => pop.close(open.id)}
              extra={
                <div className="space-y-1.5 border-t border-black/6 p-3">
                  <Labeled label="border">
                    <SelectField
                      value={s.type}
                      options={strokeOptions}
                      onChange={(type) =>
                        // Fibres start from their own default amount.
                        patch(s.id, {
                          type,
                          ...(type === 'fibres' &&
                            !(s.fibers > 0) && {
                              fibers: newStroke(type).fibers,
                            }),
                        })
                      }
                    />
                  </Labeled>
                  <Rows
                    schema={{ ...strokeSchema, ...STROKES[s.type]?.schema }}
                    values={{ sides: 'all', ...s }}
                    onChange={(k, v) => patch(s.id, { [k]: v })}
                  />
                  <Labeled label="opacity">
                    <NumberField
                      value={s.opacity}
                      onChange={(opacity) => patch(s.id, { opacity })}
                      min={0}
                      max={1}
                      step={0.01}
                      factor={100}
                      suffix="%"
                    />
                  </Labeled>
                </div>
              }
            />
          )
        );
      })}
    </ItemList>
  );
}

// A section holding a list of items, each a row that can open its own
// popover: drag to reorder, an eye to hide, a minus to remove. The rows and
// popovers are the caller's; the list, popover state and add button are here.
type ItemApi<T> = {
  patch: (p: Partial<T>) => void;
  remove: () => void;
  open: boolean;
  toggle: (el: Element) => void;
};
function ItemList<T extends { id: string; visible: boolean }>({
  title,
  what,
  items,
  onItems,
  add,
  row,
  popover,
  children,
}: {
  title: string;
  // What one item is called, for the eye's and minus's tooltips.
  what: (item: T) => string;
  items: T[];
  onItems: (next: T[]) => void;
  // The section's add button; `open` opens the new item's popover.
  add: (open: (id: string, el: Element) => void) => React.ReactNode;
  row: (item: T, api: ItemApi<T>) => React.ReactNode;
  popover?: (
    item: T,
    api: ItemApi<T>,
  ) => { title: React.ReactNode; body: React.ReactNode };
  children?: React.ReactNode;
}) {
  const { opens, isOpen, openAt, close, toggle } = usePopovers();
  const apiOf = (x: T): ItemApi<T> => ({
    patch: (p) => onItems(patchIn(items, x.id, p)),
    remove: () => onItems(items.filter((y) => y.id !== x.id)),
    open: isOpen(x.id),
    toggle: (el) => toggle(x.id, el),
  });
  return (
    <Section title={title} aside={add(openAt)}>
      {children}
      {items.length > 0 && (
        <SortableList
          items={items}
          onItems={onItems}
          active={opens.map((o) => o.id)}
          row={(x) => {
            const api = apiOf(x);
            return (
              <>
                {row(x, api)}
                <VisibleToggle
                  on={x.visible}
                  what={what(x)}
                  onToggle={() =>
                    api.patch({ visible: !x.visible } as Partial<T>)
                  }
                />
                <Remove what={what(x)} onClick={api.remove} />
              </>
            );
          }}
        />
      )}
      {popover &&
        opens.map((at) => {
          const x = items.find((y) => y.id === at.id);
          if (!x) return null;
          const p = popover(x, apiOf(x));
          return (
            <Popover
              key={x.id}
              title={p.title}
              at={at}
              onClose={() => close(at.id)}
            >
              {p.body}
            </Popover>
          );
        })}
    </Section>
  );
}

// A row's main part: its icon or swatch and name, which opens its popover.
function RowLabel({
  visible,
  onOpen,
  children,
}: {
  visible: boolean;
  onOpen?: (el: Element) => void;
  children: React.ReactNode;
}) {
  const cls = `flex min-w-0 flex-1 items-center gap-1.5 self-stretch text-left ${visible ? 'text-neutral-800' : 'text-neutral-400'}`;
  return onOpen ? (
    <button onClick={(e) => onOpen(e.currentTarget)} className={cls}>
      {children}
    </button>
  ) : (
    <span className={cls}>{children}</span>
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
  return (
    <ItemList
      title="Shadow"
      what={() => 'shadow'}
      items={shadows}
      onItems={onShadows}
      add={() => (
        <IconButton
          title="Add a shadow"
          onClick={() => onShadows([...shadows, newShadow()])}
        >
          <Plus size={13} />
        </IconButton>
      )}
      row={(s, api) => (
        <>
          <RowLabel visible={s.visible} onOpen={api.toggle}>
            <span
              className="size-4 shrink-0 rounded-[3px] border border-black/15"
              style={{ background: s.color }}
            />
            <span className="truncate">Drop shadow</span>
          </RowLabel>
          <NumberField
            value={s.opacity}
            onChange={(opacity) => api.patch({ opacity })}
            min={0}
            max={1}
            step={0.01}
            factor={100}
            suffix="%"
            className="w-14 shrink-0"
          />
        </>
      )}
      popover={(s, api) => ({
        title: 'Drop shadow',
        body: (
          <div className="space-y-1.5 p-3">
            <Rows
              schema={shadowSchema}
              values={s}
              onChange={(k, v) => api.patch({ [k]: v })}
            />
          </div>
        ),
      })}
    />
  );
}

const FILTER_ICONS: Record<string, LucideIcon> = {
  water: Waves,
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
// Each row is its type and main value, like Paper's; clicking it opens the
// rest.
export function FilterList({
  filters,
  onFilters,
}: {
  filters: FilterDoc[];
  onFilters: (next: FilterDoc[]) => void;
}) {
  const valuesOf = (f: FilterDoc) => {
    const schema = FILTERS[f.type]?.schema ?? {};
    return { ...defaultsOf(schema), ...fit(f.values, schema) };
  };
  return (
    <ItemList
      title="Filters"
      what={() => 'filter'}
      items={filters}
      onItems={onFilters}
      add={() => (
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
      )}
      row={(f, api) => {
        const def = FILTERS[f.type];
        const Icon = FILTER_ICONS[f.type] ?? SlidersHorizontal;
        const v = valuesOf(f);
        const main = def?.main;
        const control = main ? def.schema[main] : undefined;
        return (
          <>
            <RowLabel visible={f.visible} onOpen={api.toggle}>
              <Icon
                size={14}
                strokeWidth={1.75}
                className="shrink-0 text-neutral-500"
              />
              <span className="truncate">{def?.label ?? f.type}</span>
              {f.input === 'background' && f.type !== 'water' && (
                <span className="shrink-0 text-neutral-400">behind</span>
              )}
            </RowLabel>
            {control?.kind === 'range' && (
              <NumberField
                value={Number(v[main!])}
                onChange={(x) => api.patch({ values: { ...v, [main!]: x } })}
                min={control.min}
                max={control.max}
                step={control.step}
                className="w-14 shrink-0"
              />
            )}
          </>
        );
      }}
      popover={(f, api) => ({
        title: FILTERS[f.type]?.label ?? f.type,
        body: (
          <div className="space-y-1.5 p-3">
            <Labeled label="filter">
              <SelectField
                value={f.type}
                options={filterOptions}
                onChange={(type) =>
                  api.patch({ type, values: defaultsOf(FILTERS[type].schema) })
                }
              />
            </Labeled>
            {f.type !== 'water' && (
              <Row
                name="input"
                control={filterInputSchema}
                value={f.input}
                onChange={(input) =>
                  api.patch({ input: input as FilterDoc['input'] })
                }
              />
            )}
            <Rows
              schema={FILTERS[f.type]?.schema ?? {}}
              values={valuesOf(f)}
              onChange={(k, x) =>
                api.patch({ values: { ...valuesOf(f), [k]: x } })
              }
            />
            {(f.input === 'background' || f.type === 'water') && (
              <p className="text-neutral-400">
                Works on the artwork behind this layer, inside its shape.
              </p>
            )}
          </div>
        ),
      })}
    />
  );
}

const SCALES = [0.5, 1, 2, 3, 4].map((s) => ({
  value: String(s),
  label: `${s}x`,
}));
const FORMATS = [
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPG' },
  { value: 'mp4', label: 'MP4' },
  { value: 'webm', label: 'WebM' },
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
        <div key={e.id} className="-mr-1 flex items-center gap-1.5">
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
          {isVideo(e) && (
            <NumberField
              value={e.duration ?? 5}
              onChange={(duration) => patch(e.id, { duration })}
              min={1}
              max={120}
              step={1}
              suffix="s"
              className="w-14 shrink-0"
            />
          )}
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
  const valuesOf = (o: OutlineDoc) => {
    const schema = OUTLINES[o.type]?.schema ?? {};
    return { ...defaultsOf(schema), ...fit(o.values, schema) };
  };
  return (
    <ItemList
      title="Shape"
      what={(o) => OUTLINES[o.type]?.label.toLowerCase() ?? 'effect'}
      items={outline}
      onItems={onOutline}
      add={(open) => (
        <AddMenu
          title="Add to the outline"
          options={outlineOptions}
          onPick={(type, el) => {
            const o = newOutline(type, defaultsOf(OUTLINES[type].schema));
            onOutline([...outline, o]);
            open(o.id, el);
          }}
        />
      )}
      row={(o, api) => {
        const def = OUTLINES[o.type];
        const Icon = OUTLINE_ICONS[o.type] ?? SlidersHorizontal;
        const v = valuesOf(o);
        const control = def?.schema[def.main];
        return (
          <>
            <RowLabel visible={o.visible}>
              <Icon
                size={13}
                strokeWidth={1.75}
                className="shrink-0 text-neutral-500"
              />
              <span className="truncate">{def?.label ?? o.type}</span>
            </RowLabel>
            {control?.kind === 'range' && (
              <NumberField
                value={Number(v[def.main])}
                onChange={(x) => api.patch({ values: { ...v, [def.main]: x } })}
                min={control.min}
                max={control.max}
                step={control.step}
                className="w-16 shrink-0"
              />
            )}
            {def && Object.keys(def.schema).length > 1 ? (
              <IconButton
                title={`${def.label} settings`}
                active={api.open}
                onClick={(e) => api.toggle(e.currentTarget)}
                className="size-5!"
              >
                <SlidersHorizontal size={12} />
              </IconButton>
            ) : (
              <span className="size-5 shrink-0" />
            )}
          </>
        );
      }}
      popover={(o, api) => ({
        title: OUTLINES[o.type]?.label ?? o.type,
        body: (
          <div className="space-y-1.5 p-3">
            <Rows
              schema={OUTLINES[o.type]?.schema ?? {}}
              values={valuesOf(o)}
              onChange={(k, x) =>
                api.patch({ values: { ...valuesOf(o), [k]: x } })
              }
            />
          </div>
        ),
      })}
    >
      {children}
    </ItemList>
  );
}
