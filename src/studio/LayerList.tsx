import {
  Contrast,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  Scissors,
  Trash,
} from 'lucide-react';
import { useState } from 'react';
import type { LayerDoc } from './document';
import type { LayerType } from './layer';
import { kindIcon } from './tools';
import { IconButton } from './ui';

// Which other layers lean on this one: as a mask, or as a cutter in a boolean.
function usesOf(l: LayerDoc, layers: LayerDoc[]) {
  let mask = false;
  let cutter = false;
  for (const o of layers) {
    if (o.mask.source === l.id) mask = true;
    for (const k of [1, 2, 3])
      if (
        o.combine?.[`with${k}`] === l.id &&
        (o.combine?.[`op${k}`] ?? 'none') !== 'none'
      )
        cutter = true;
  }
  return { mask, cutter };
}

// The layer stack, top of the artwork first. Drag a row to reorder it.
export default function LayerList({
  layers,
  types,
  selected,
  onSelect,
  onPatch,
  onMoveTo,
  onRemove,
  onAdd,
}: {
  layers: LayerDoc[];
  types: Record<string, LayerType>;
  selected: string | null;
  onSelect: (id: string) => void;
  onPatch: (id: string, patch: Partial<LayerDoc>) => void;
  // `index` in document order, bottom to top.
  onMoveTo: (id: string, index: number) => void;
  onRemove: (id: string) => void;
  onAdd: (type: string) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  // Where a drop would land: before the row at this display position.
  const [over, setOver] = useState<number | null>(null);
  const shown = [...layers].reverse();

  const drop = () => {
    if (dragging !== null && over !== null) {
      const from = shown.findIndex((l) => l.id === dragging);
      // Display slot -> document index, accounting for the row leaving.
      const slot = over > from ? over - 1 : over;
      onMoveTo(dragging, layers.length - 1 - slot);
    }
    setDragging(null);
    setOver(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between pr-2 pl-3">
        <span className="font-medium text-neutral-900">Layers</span>
        <label
          title="Add a shader layer"
          className="relative grid size-6 cursor-pointer place-items-center rounded-md text-neutral-500 hover:bg-black/5 hover:text-neutral-900"
        >
          <Plus size={14} />
          <select
            value=""
            onChange={(e) => onAdd(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            <option value="">Add a layer…</option>
            {Object.entries(types).map(([id, t]) => (
              <option key={id} value={id}>
                {t.label}
                {id.startsWith('local/') ? ' (this artwork)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul
        className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2"
        onDragOver={(e) => {
          e.preventDefault();
          if (e.target === e.currentTarget) setOver(shown.length);
        }}
        onDrop={drop}
      >
        {shown.length === 0 && (
          <li className="px-3 py-2 text-neutral-400">
            Draw a shape, or add a shader.
          </li>
        )}
        {shown.map((l, i) => {
          const t = types[l.type];
          const Kind = kindIcon(l);
          const { mask, cutter } = usesOf(l, layers);
          const on = l.id === selected;
          return (
            <li
              key={l.id}
              draggable={renaming !== l.id}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                setDragging(l.id);
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
              onClick={() => onSelect(l.id)}
              className={`group relative flex h-7 cursor-default items-center gap-1 rounded-md pr-1 ${on ? 'bg-sky-500/12 text-neutral-900' : 'text-neutral-700 hover:bg-black/4'} ${dragging === l.id ? 'opacity-40' : ''}`}
            >
              {over === i && dragging && (
                <span className="absolute inset-x-1 -top-px h-0.5 bg-sky-500" />
              )}
              {over === shown.length && i === shown.length - 1 && dragging && (
                <span className="absolute inset-x-1 -bottom-px h-0.5 bg-sky-500" />
              )}
              <GripVertical
                size={11}
                className="-mr-0.5 shrink-0 cursor-grab text-transparent group-hover:text-neutral-300"
              />
              <Kind
                size={13}
                strokeWidth={1.75}
                className={`shrink-0 ${l.visible ? 'text-neutral-500' : 'text-neutral-300'}`}
              />
              {renaming === l.id ? (
                <input
                  autoFocus
                  defaultValue={l.name}
                  onFocus={(e) => e.currentTarget.select()}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    const name = e.currentTarget.value.trim();
                    if (name && name !== l.name) onPatch(l.id, { name });
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') {
                      e.currentTarget.value = l.name;
                      e.currentTarget.blur();
                    }
                  }}
                  className="ml-1 h-5.5 min-w-0 flex-1 rounded-md border border-sky-500/70 bg-white px-1 text-neutral-900 outline-none select-text"
                />
              ) : (
                <span
                  title={t ? t.label : `missing: ${l.type}`}
                  onDoubleClick={() => setRenaming(l.id)}
                  className={`ml-1 min-w-0 flex-1 truncate ${l.visible ? '' : 'text-neutral-400'} ${t ? '' : 'text-red-500'}`}
                >
                  {l.name}
                </span>
              )}
              {mask && (
                <span title="Used as a mask" className="text-neutral-400">
                  <Contrast size={11} />
                </span>
              )}
              {cutter && (
                <span title="Used in a boolean" className="text-neutral-400">
                  <Scissors size={11} />
                </span>
              )}
              <IconButton
                title="Delete layer"
                onClick={() => onRemove(l.id)}
                className="size-5! opacity-0 group-hover:opacity-100 hover:text-red-500!"
              >
                <Trash size={11} />
              </IconButton>
              <IconButton
                title={l.visible ? 'Hide' : 'Show'}
                onClick={() => onPatch(l.id, { visible: !l.visible })}
                className={`size-5! ${l.visible ? 'opacity-0 group-hover:opacity-100' : ''}`}
              >
                {l.visible ? <Eye size={12} /> : <EyeOff size={12} />}
              </IconButton>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
