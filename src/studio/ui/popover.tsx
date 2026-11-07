import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './basics';

// A floating panel: drag its header to move it; Escape or a click outside
// closes it. Popovers can open from inside one another; Escape closes the
// innermost, and clicks in any popover or on a list row leave them be.
export function Popover({
  title,
  at,
  onClose,
  actions,
  width = 280,
  children,
}: {
  title: React.ReactNode;
  at: { top: number; left: number };
  onClose: () => void;
  actions?: React.ReactNode;
  width?: number;
  children: React.ReactNode;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const all = document.querySelectorAll('[data-popover]');
      if (all[all.length - 1] !== el.current) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close.current();
    };
    const down = (e: PointerEvent) => {
      const t = e.target as Element;
      if (t.closest?.('[data-popover], [data-popover-anchor]')) return;
      close.current();
    };
    addEventListener('keydown', key, true);
    addEventListener('pointerdown', down, true);
    return () => {
      removeEventListener('keydown', key, true);
      removeEventListener('pointerdown', down, true);
    };
  }, []);

  // Drag by the header, kept on screen.
  const drag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    e.preventDefault();
    const head = e.currentTarget;
    const box = el.current!.getBoundingClientRect();
    const dx = e.clientX - box.left;
    const dy = e.clientY - box.top;
    head.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) =>
      setPos({
        left: Math.max(0, Math.min(m.clientX - dx, innerWidth - box.width)),
        top: Math.max(0, Math.min(m.clientY - dy, innerHeight - 36)),
      });
    const up = () => {
      head.removeEventListener('pointermove', move);
      head.removeEventListener('pointerup', up);
    };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
  };

  // Drawn at the studio's root rather than where it was opened, so nothing it
  // sits inside (a label, say) can react to clicks in it.
  return createPortal(
    <div
      ref={el}
      data-popover
      style={{
        top: pos.top,
        left: pos.left,
        width,
        maxHeight: `calc(100vh - ${pos.top + 8}px)`,
      }}
      className="fixed z-50 flex flex-col overflow-hidden rounded-lg border border-black/10 bg-white text-[11px] shadow-[0_8px_32px_rgb(0_0_0/0.18),0_1px_3px_rgb(0_0_0/0.08)] select-none"
    >
      <div
        onPointerDown={drag}
        className="flex h-9 shrink-0 cursor-grab items-center gap-0.5 border-b border-black/6 pr-1.5 pl-3 active:cursor-grabbing"
      >
        <span className="min-w-0 flex-1 truncate font-semibold text-neutral-900">
          {title}
        </span>
        {actions}
        <IconButton title="Close (Esc)" onClick={onClose}>
          <X size={13} />
        </IconButton>
      </div>
      <div className="min-h-0 overflow-y-auto">{children}</div>
    </div>,
    document.querySelector('.studio') ?? document.body,
  );
}
