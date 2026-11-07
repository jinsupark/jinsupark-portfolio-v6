import {
  Eye,
  EyeOff,
  Film,
  Image as ImageIcon,
  Minus,
  Plus,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { newFill, type FillDoc } from './document';
import type { LayerType } from './layer';
import PaintPopover from './Paint';
import { gradientCss } from './paints';
import { usePopovers } from './tools';
import {
  IconButton,
  NumberField,
  Section,
  Menu,
  SortableList,
  Tip,
  type MenuOption,
} from './ui';

// A fill's little square: its colour, gradient or picture, or an icon for a
// shader.
export function Swatch({ f }: { f?: FillDoc }) {
  const v = (f?.values ?? {}) as Record<string, string>;
  const box = 'size-4 shrink-0 rounded-[3px] border border-black/15';
  if (f?.type === 'solid')
    return <span className={box} style={{ background: v.color }} />;
  if (f?.type === 'gradient')
    return <span className={box} style={{ background: gradientCss(v) }} />;
  if (f?.type === 'image' && v.src)
    return (
      <span
        className={`${box} bg-cover bg-center`}
        style={{ backgroundImage: `url(${v.src})` }}
      />
    );
  const Icon =
    f?.type === 'video' ? Film : f?.type === 'image' ? ImageIcon : Sparkles;
  return (
    <Icon size={14} strokeWidth={1.75} className="shrink-0 text-neutral-500" />
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

// A stack of fills, top first, like Figma's. Click one to edit it in a
// popover; drag to reorder; + adds one. Used for a layer's fills and for a
// stroke's paint.
export default function FillList({
  fills,
  onFills,
  types,
  title = 'Fill',
  onRetype,
}: {
  fills: FillDoc[];
  onFills: (next: FillDoc[]) => void;
  types: Record<string, LayerType>;
  title?: string;
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
      title={title}
      aside={
        <IconButton
          title="Add a fill"
          onClick={(e) => {
            // Like Figma: a solid to start, its paint picker open to change it.
            const t = types.solid;
            const f = newFill('solid', { ...t.initial() }, t.version);
            onFills([...fills, f]);
            openAt(f.id, e.currentTarget);
          }}
        >
          <Plus size={13} />
        </IconButton>
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
            <PaintPopover
              key={current.id}
              title={labelOf(current)}
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
