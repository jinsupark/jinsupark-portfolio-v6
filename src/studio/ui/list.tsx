import { useState } from 'react';

// A list shown top first (the last item on top, as in a stack), dragged to
// reorder. `row` draws an item's contents; rows carry `data-popover-anchor`
// so a popover opened from one doesn't close when another is clicked.
export function SortableList<T extends { id: string }>({
  items,
  onItems,
  row,
  empty,
  active,
}: {
  items: T[];
  onItems: (next: T[]) => void;
  row: (item: T) => React.ReactNode;
  empty?: string;
  // The item (or items) whose popover is open, shown highlighted.
  active?: string | string[] | null;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const shown = [...items].reverse();
  const drop = () => {
    if (dragging !== null && over !== null) {
      const from = shown.findIndex((x) => x.id === dragging);
      const slot = over > from ? over - 1 : over;
      const list = items.filter((x) => x.id !== dragging);
      list.splice(
        list.length - slot,
        0,
        items.find((x) => x.id === dragging)!,
      );
      onItems(list);
    }
    setDragging(null);
    setOver(null);
  };
  return (
    <ul
      className="-mx-1.5 flex flex-col gap-0.5"
      onDragOver={(e) => e.preventDefault()}
      onDrop={drop}
    >
      {shown.length === 0 && empty && (
        <li className="px-1.5 py-1 text-neutral-400">{empty}</li>
      )}
      {shown.map((x, i) => (
        <li
          key={x.id}
          draggable
          data-popover-anchor
          onDragStart={(e) => {
            if ((e.target as Element).closest('input'))
              return e.preventDefault();
            e.dataTransfer.effectAllowed = 'move';
            setDragging(x.id);
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
          className={`relative flex h-7 shrink-0 items-center gap-1.5 rounded-md pr-0.5 pl-1.5 ${(Array.isArray(active) ? active.includes(x.id) : active === x.id) ? 'bg-sky-500/12' : 'hover:bg-black/4'} ${dragging === x.id ? 'opacity-40' : ''}`}
        >
          {over === i && dragging && (
            <span className="absolute inset-x-1 -top-px h-0.5 bg-sky-500" />
          )}
          {over === shown.length && i === shown.length - 1 && dragging && (
            <span className="absolute inset-x-1 -bottom-px h-0.5 bg-sky-500" />
          )}
          {row(x)}
        </li>
      ))}
    </ul>
  );
}
