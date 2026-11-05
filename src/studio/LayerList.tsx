import {
  ChevronDown,
  ChevronRight,
  Contrast,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  GripVertical,
  Plus,
  Scissors,
} from 'lucide-react';
import { useState } from 'react';
import { primaryFill, type GroupDoc, type LayerDoc } from './document';
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

type Row =
  | { kind: 'layer'; key: string; l: LayerDoc; depth: number }
  | { kind: 'group'; key: string; g: GroupDoc; members: LayerDoc[] };

// Where a drop lands: before document index `index`, in folder `group`.
type Target = { key: string; below: boolean; index: number; group?: string };

// A name that turns into a field on double-click. Enter or leaving keeps the
// edit; Escape drops it.
function Name({
  value,
  editing,
  onEdit,
  onDone,
  className = '',
  title,
}: {
  value: string;
  editing: boolean;
  onEdit: () => void;
  onDone: (v: string | null) => void;
  className?: string;
  title?: string;
}) {
  if (!editing)
    return (
      <span
        title={title}
        onDoubleClick={onEdit}
        className={`ml-1 min-w-0 flex-1 truncate ${className}`}
      >
        {value}
      </span>
    );
  return (
    <input
      autoFocus
      defaultValue={value}
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => {
        const v = e.currentTarget.value.trim();
        onDone(v && v !== value ? v : null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          e.currentTarget.value = value;
          e.currentTarget.blur();
        }
      }}
      className="ml-1 h-5.5 min-w-0 flex-1 rounded-md border border-sky-500/70 bg-white px-1 text-neutral-900 outline-none select-text"
    />
  );
}

// The layer stack, top of the artwork first, with folders holding their
// layers nested under them. Shift-click adds to the selection; drag a row or a
// folder to reorder it.
export default function LayerList({
  layers,
  groups,
  types,
  selection,
  onSelect,
  onPatch,
  onPatchMany,
  onRenameGroup,
  onMoveTo,
  onAdd,
}: {
  layers: LayerDoc[];
  groups: GroupDoc[];
  types: Record<string, LayerType>;
  selection: string[];
  onSelect: (ids: string[], additive: boolean) => void;
  onPatch: (id: string, patch: Partial<LayerDoc>) => void;
  onPatchMany: (
    ids: string[],
    patch: (l: LayerDoc) => Partial<LayerDoc>,
  ) => void;
  onRenameGroup: (id: string, name: string) => void;
  // `index` in document order, bottom to top.
  onMoveTo: (ids: string[], index: number, group?: string) => void;
  onAdd: (type: string) => void;
}) {
  const [dragging, setDragging] = useState<{
    ids: string[];
    group?: string;
  } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [shut, setShut] = useState<Set<string>>(() => new Set());
  const [over, setOver] = useState<Target | null>(null);

  const indexOf = (id: string) => layers.findIndex((l) => l.id === id);
  const byId = new Map(groups.map((g) => [g.id, g]));

  // Top first. A folder's row comes where its topmost layer is, with all its
  // layers under it.
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const l of [...layers].reverse()) {
    const g = l.group ? byId.get(l.group) : undefined;
    if (!g) {
      rows.push({ kind: 'layer', key: l.id, l, depth: 0 });
      continue;
    }
    if (seen.has(g.id)) continue;
    seen.add(g.id);
    const members = layers.filter((x) => x.group === g.id).reverse();
    rows.push({ kind: 'group', key: `g:${g.id}`, g, members });
    if (!shut.has(g.id))
      for (const m of members)
        rows.push({ kind: 'layer', key: m.id, l: m, depth: 1 });
  }

  // What dropping on the top or bottom half of a row would do.
  const targetOf = (r: Row, below: boolean): Target => {
    const movingFolder = !!dragging?.group;
    if (r.kind === 'group') {
      const ix = r.members.map((m) => indexOf(m.id));
      const top = Math.max(...ix) + 1;
      // Under an open folder's title is the top of the folder.
      if (below && !shut.has(r.g.id) && !movingFolder)
        return { key: r.key, below, index: top, group: r.g.id };
      return { key: r.key, below, index: below ? Math.min(...ix) : top };
    }
    const i = indexOf(r.l.id);
    // A folder can't go inside another: it lands beside that one instead.
    if (movingFolder && r.depth === 1 && r.l.group !== dragging?.group) {
      const head = rows.find((x) => x.kind === 'group' && x.g.id === r.l.group);
      if (head) return { ...targetOf(head, false), key: r.key, below };
    }
    return {
      key: r.key,
      below,
      index: below ? i : i + 1,
      group: movingFolder ? dragging?.group : r.l.group,
    };
  };

  const drop = () => {
    if (dragging && over) onMoveTo(dragging.ids, over.index, over.group);
    setDragging(null);
    setOver(null);
  };

  const dragProps = (r: Row, ids: string[], group?: string) => ({
    draggable: renaming !== r.key,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = 'move';
      setDragging({ ids, group });
    },
    onDragEnd: () => {
      setDragging(null);
      setOver(null);
    },
    onDragOver: (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      const b = e.currentTarget.getBoundingClientRect();
      setOver(targetOf(r, e.clientY > b.top + b.height / 2));
    },
  });

  const line = (r: Row, depth: number) =>
    over?.key === r.key &&
    dragging && (
      <span
        className={`absolute right-1 h-0.5 bg-sky-500 ${over.below ? '-bottom-px' : '-top-px'}`}
        style={{ left: 8 + depth * 14 }}
      />
    );

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
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1.5 pb-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={drop}
      >
        {rows.length === 0 && (
          <li className="px-3 py-2 text-neutral-400">
            Draw a shape, or add a shader.
          </li>
        )}
        {rows.map((r) => {
          if (r.kind === 'group') {
            const ids = r.members.map((m) => m.id);
            const open = !shut.has(r.g.id);
            const on = ids.every((id) => selection.includes(id));
            const visible = r.members.some((m) => m.visible);
            const Chevron = open ? ChevronDown : ChevronRight;
            const Icon = open ? FolderOpen : Folder;
            return (
              <li
                key={r.key}
                {...dragProps(r, ids, r.g.id)}
                onClick={(e) => onSelect(ids, e.shiftKey)}
                className={`group relative flex h-7 shrink-0 cursor-default items-center gap-1 rounded-md pr-1 ${on ? 'bg-sky-500/12 text-neutral-900' : 'text-neutral-700 hover:bg-black/4'} ${dragging?.group === r.g.id ? 'opacity-40' : ''}`}
              >
                {line(r, 0)}
                <button
                  aria-label={open ? 'Collapse folder' : 'Expand folder'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShut((s) => {
                      const n = new Set(s);
                      if (open) n.add(r.g.id);
                      else n.delete(r.g.id);
                      return n;
                    });
                  }}
                  className="-mr-0.5 grid w-3 shrink-0 place-items-center text-neutral-400 hover:text-neutral-700"
                >
                  <Chevron size={11} />
                </button>
                <Icon
                  size={13}
                  strokeWidth={1.75}
                  className={`shrink-0 ${visible ? 'text-neutral-500' : 'text-neutral-300'}`}
                />
                <Name
                  value={r.g.name}
                  editing={renaming === r.key}
                  onEdit={() => setRenaming(r.key)}
                  onDone={(v) => {
                    if (v) onRenameGroup(r.g.id, v);
                    setRenaming(null);
                  }}
                  className={`font-medium ${visible ? '' : 'text-neutral-400'}`}
                />
                <IconButton
                  title={visible ? 'Hide folder' : 'Show folder'}
                  onClick={() =>
                    onPatchMany(ids, () => ({ visible: !visible }))
                  }
                  className={`size-5! ${visible ? 'opacity-0 group-hover:opacity-100' : ''}`}
                >
                  {visible ? <Eye size={12} /> : <EyeOff size={12} />}
                </IconButton>
              </li>
            );
          }

          const { l, depth } = r;
          const main = primaryFill(l);
          const t = main && types[main.type];
          const Kind = kindIcon(l);
          const { mask, cutter } = usesOf(l, layers);
          const on = selection.includes(l.id);
          return (
            <li
              key={r.key}
              {...dragProps(r, [l.id])}
              onClick={(e) => onSelect([l.id], e.shiftKey)}
              style={{ paddingLeft: depth * 14 }}
              className={`group relative flex h-7 shrink-0 cursor-default items-center gap-1 rounded-md pr-1 ${on ? 'bg-sky-500/12 text-neutral-900' : 'text-neutral-700 hover:bg-black/4'} ${dragging?.ids.includes(l.id) && !dragging.group ? 'opacity-40' : ''}`}
            >
              {line(r, depth)}
              <GripVertical
                size={11}
                className="-mr-0.5 shrink-0 cursor-grab text-neutral-300"
              />
              <Kind
                size={13}
                strokeWidth={1.75}
                className={`shrink-0 ${l.visible ? 'text-neutral-500' : 'text-neutral-300'}`}
              />
              <Name
                value={l.name}
                title={t ? t.label : main ? `missing: ${main.type}` : 'No fill'}
                editing={renaming === r.key}
                onEdit={() => setRenaming(r.key)}
                onDone={(v) => {
                  if (v) onPatch(l.id, { name: v });
                  setRenaming(null);
                }}
                className={`${l.visible ? '' : 'text-neutral-400'} ${t || !main ? '' : 'text-red-500'}`}
              />
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
