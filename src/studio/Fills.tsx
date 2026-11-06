import { Dices, Eye, EyeOff, Minus, Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { defaultsOf, fit } from '@/lab/controls';
import { newFill, type FillDoc } from './document';
import type { LayerType } from './layer';
import { fillSpaceSchema } from './studioSchemas';
import { blendOptions, resetGroup, usePopovers } from './tools';
import {
  ControlGroups,
  IconButton,
  Labeled,
  NumberField,
  Popover,
  Row,
  Section,
  SelectField,
  Menu,
  SortableList,
  Tip,
  type MenuOption,
} from './ui';

const randomSeed = () => 1 + Math.floor(Math.random() * 999);

// A fill's little square: its colour or gradient for a solid, otherwise an
// icon.
export function Swatch({ f }: { f?: FillDoc }) {
  if (f?.type === 'solid') {
    const v = f.values as {
      color?: string;
      color2?: string;
      gradient?: boolean;
    };
    const bg = v.gradient
      ? `linear-gradient(135deg, ${v.color}, ${v.color2})`
      : v.color;
    return (
      <span
        className="size-4 shrink-0 rounded-[3px] border border-black/15"
        style={{ background: bg ?? '#3d2b33' }}
      />
    );
  }
  return (
    <Sparkles
      size={14}
      strokeWidth={1.75}
      className="shrink-0 text-neutral-500"
    />
  );
}

// A + (or another icon) that opens a menu of choices.
export function AddMenu({
  title,
  options,
  onPick,
  icon,
}: {
  title: string;
  options: MenuOption[];
  onPick: (value: string, el: HTMLElement) => void;
  icon?: React.ReactNode;
}) {
  const [at, setAt] = useState<{ rect: DOMRect; el: HTMLElement } | null>(null);
  return (
    <>
      <Tip label={title}>
        <button
          aria-label={title}
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
          className={`flex h-6 min-w-6 shrink-0 items-center justify-center gap-0.5 rounded-md px-1 text-neutral-500 outline-none hover:bg-black/5 hover:text-neutral-900 ${at ? 'bg-black/5 text-neutral-900' : ''}`}
        >
          {icon ?? <Plus size={13} />}
        </button>
      </Tip>
      {at && (
        <Menu
          anchor={at.rect}
          trigger={at.el}
          options={options}
          onPick={(v) => onPick(v, at.el)}
          onClose={() => setAt(null)}
        />
      )}
    </>
  );
}

const typeOptions = (types: Record<string, LayerType>) =>
  Object.entries(types).map(([id, t]) => ({
    value: id,
    label: id.startsWith('local/') ? `${t.label} (this artwork)` : t.label,
  }));

// A stack of fills, top first, like Figma's. Click one to edit it in a
// popover; drag to reorder; + adds one. Used for a layer's fills and for a
// stroke's paint.
export default function FillList({
  fills,
  onFills,
  types,
  title = 'Fill',
  id = 'insp:Fill',
  onRetype,
}: {
  fills: FillDoc[];
  onFills: (next: FillDoc[]) => void;
  types: Record<string, LayerType>;
  title?: string;
  id?: string;
  // A fill changed type, so a name that followed it can follow again.
  onRetype?: (
    fill: FillDoc,
    from: LayerType | undefined,
    to: LayerType,
  ) => void;
}) {
  const { opens, openAt, close, toggle } = usePopovers();
  const labelOf = (f: FillDoc) => types[f.type]?.label ?? `missing: ${f.type}`;
  const patchFill = (fid: string, p: Partial<FillDoc>) =>
    onFills(fills.map((f) => (f.id === fid ? { ...f, ...p } : f)));

  return (
    <Section
      id={id}
      title={title}
      aside={
        <AddMenu
          title="Add a fill"
          options={typeOptions(types)}
          onPick={(type, el) => {
            const t = types[type];
            const f = newFill(type, { ...t.initial() }, t.version);
            onFills([...fills, f]);
            openAt(f.id, el);
          }}
        />
      }
    >
      <SortableList
        items={fills}
        onItems={onFills}
        active={opens.map((o) => o.id)}
        empty="No fills."
        row={(f) => (
          <>
            <button
              onClick={(e) => toggle(f.id, e.currentTarget)}
              className={`flex min-w-0 flex-1 items-center gap-1.5 self-stretch text-left ${f.visible ? 'text-neutral-800' : 'text-neutral-400'}`}
            >
              <Swatch f={f} />
              <span className="truncate">{labelOf(f)}</span>
            </button>
            <NumberField
              value={f.opacity}
              onChange={(opacity) => patchFill(f.id, { opacity })}
              min={0}
              max={1}
              step={0.01}
              factor={100}
              suffix="%"
              className="w-14 shrink-0"
            />
            <IconButton
              title={f.visible ? 'Hide fill' : 'Show fill'}
              onClick={() => patchFill(f.id, { visible: !f.visible })}
              className="size-5!"
            >
              {f.visible ? <Eye size={12} /> : <EyeOff size={12} />}
            </IconButton>
            <IconButton
              title="Remove fill"
              onClick={() => onFills(fills.filter((x) => x.id !== f.id))}
              className="size-5!"
            >
              <Minus size={12} />
            </IconButton>
          </>
        )}
      />

      {opens.map((open) => {
        const current = fills.find((x) => x.id === open.id);
        return (
          current && (
            <FillPopover
              key={current.id}
              fill={current}
              types={types}
              at={open}
              onPatch={(p) => patchFill(current.id, p)}
              onRetype={onRetype}
              onClose={() => close(open.id)}
            />
          )
        );
      })}
    </Section>
  );
}

function FillPopover({
  fill,
  types,
  at,
  onPatch,
  onRetype,
  onClose,
}: {
  fill: FillDoc;
  types: Record<string, LayerType>;
  at: { top: number; left: number };
  onPatch: (p: Partial<FillDoc>) => void;
  onRetype?: (
    fill: FillDoc,
    from: LayerType | undefined,
    to: LayerType,
  ) => void;
  onClose: () => void;
}) {
  const t = types[fill.type];
  const schema = t?.schema ?? {};
  const values = { ...defaultsOf(schema), ...fit(fill.values, schema) };
  return (
    <Popover
      title={t?.label ?? fill.type}
      at={at}
      onClose={onClose}
      actions={
        t &&
        'seed' in t.schema && (
          <IconButton
            title="Re-seed"
            onClick={() =>
              onPatch({ values: { ...values, seed: randomSeed() } })
            }
          >
            <Dices size={12} />
          </IconButton>
        )
      }
    >
      <div className="space-y-1.5 border-b border-black/6 p-3">
        <Labeled label="fill">
          <SelectField
            value={fill.type}
            options={typeOptions(types)}
            onChange={(v) => {
              const next = types[v];
              if (!next || v === fill.type) return;
              onRetype?.(fill, t, next);
              onPatch({
                type: v,
                version: next.version,
                values: { ...next.initial() },
              });
            }}
          />
        </Labeled>
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
      {t ? (
        <ControlGroups
          id={`fill:${fill.type}`}
          schema={schema}
          values={values}
          onChange={(k, v) => onPatch({ values: { ...values, [k]: v } })}
          onReset={(g) => onPatch({ values: resetGroup(schema, values, g) })}
        />
      ) : (
        <p className="p-3 text-red-500">
          This fill's type ({fill.type}) isn't available.
        </p>
      )}
    </Popover>
  );
}
