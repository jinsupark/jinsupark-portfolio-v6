import {
  Check,
  ChevronDown,
  FilePlus,
  Moon,
  RotateCcw,
  Save,
  Sun,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { TextField } from './ui';

// The artwork's name at the top of the sidebar, like Paper's and Figma's:
// double-click to rename it; click for its menu — open another work, start a
// new one, its slug.
export default function ArtworkTitle({
  title,
  slug,
  current,
  works,
  onRename,
  onSlug,
  onOpen,
  onNew,
  onSave,
  onRevert,
  dark,
  onToggleDark,
}: {
  title: string;
  slug: string;
  // The open work's slug, or empty for an unsaved draft.
  current: string;
  works: { slug: string; title: string }[];
  onRename: (title: string) => void;
  onSlug: (slug: string) => void;
  onOpen: (slug: string) => void;
  onNew: () => void;
  onSave: () => void;
  // Only for a saved work: drop the unsaved edits.
  onRevert?: () => void;
  dark: boolean;
  onToggleDark: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const down = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setMenu(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setMenu(false);
    };
    addEventListener('pointerdown', down, true);
    addEventListener('keydown', key, true);
    return () => {
      removeEventListener('pointerdown', down, true);
      removeEventListener('keydown', key, true);
    };
  }, [menu]);

  return (
    <div ref={box} className="relative min-w-0 flex-1">
      {renaming ? (
        <input
          autoFocus
          defaultValue={title}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim();
            if (v && v !== title) onRename(v);
            setRenaming(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              e.currentTarget.value = title;
              e.currentTarget.blur();
            }
          }}
          className="h-7 w-full min-w-0 rounded-md border border-sky-500/70 bg-white px-1.5 text-[12px] font-semibold text-neutral-900 outline-none select-text"
        />
      ) : (
        <button
          title="Click for the menu, double-click to rename"
          onClick={() => setMenu((m) => !m)}
          onDoubleClick={() => {
            setMenu(false);
            setRenaming(true);
          }}
          className={`flex h-7 w-full min-w-0 items-center gap-1 rounded-md px-1.5 text-left hover:bg-black/5 ${menu ? 'bg-black/5' : ''}`}
        >
          <span className="truncate text-[12px] font-semibold text-neutral-900">
            {title || 'Untitled'}
          </span>
          <ChevronDown size={12} className="shrink-0 text-neutral-400" />
        </button>
      )}

      {menu && (
        <div className="absolute top-full left-0 z-50 mt-1 w-60 overflow-hidden rounded-lg border border-black/10 bg-white text-[11px] shadow-[0_8px_32px_rgb(0_0_0/0.18),0_1px_3px_rgb(0_0_0/0.08)]">
          <div className="space-y-1.5 border-b border-black/6 p-2.5">
            <label className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-2">
              <span className="text-neutral-500">Slug</span>
              <TextField value={slug} onChange={onSlug} />
            </label>
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {[{ slug: '', title: 'Unsaved draft' }, ...works].map((w) => (
              <li key={w.slug}>
                <button
                  onClick={() => {
                    setMenu(false);
                    if (w.slug !== current) onOpen(w.slug);
                  }}
                  className="flex h-7 w-full items-center gap-2 px-2.5 text-left hover:bg-black/4"
                >
                  <Check
                    size={12}
                    className={
                      w.slug === current ? 'text-neutral-700' : 'invisible'
                    }
                  />
                  <span className="truncate">{w.title || w.slug}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-black/6 py-1">
            <button
              onClick={() => {
                setMenu(false);
                onSave();
              }}
              className="flex h-7 w-full items-center gap-2 px-2.5 text-left hover:bg-black/4"
            >
              <Save size={12} className="text-neutral-500" />
              <span className="flex-1">Save</span>
              <span className="text-neutral-400">⌘S</span>
            </button>
            <button
              onClick={() => {
                setMenu(false);
                onToggleDark();
              }}
              className="flex h-7 w-full items-center gap-2 px-2.5 text-left hover:bg-black/4"
            >
              {dark ? (
                <Sun size={12} className="text-neutral-500" />
              ) : (
                <Moon size={12} className="text-neutral-500" />
              )}
              <span className="flex-1">
                {dark ? 'Light mode' : 'Dark mode'}
              </span>
              <span className="text-neutral-400">⇧⌘D</span>
            </button>
            {onRevert && (
              <button
                onClick={() => {
                  setMenu(false);
                  onRevert();
                }}
                className="flex h-7 w-full items-center gap-2 px-2.5 text-left hover:bg-black/4"
              >
                <RotateCcw size={12} className="text-neutral-500" />
                Revert to saved
              </button>
            )}
          </div>
          <button
            onClick={() => {
              setMenu(false);
              onNew();
            }}
            className="flex h-8 w-full items-center gap-2 border-t border-black/6 px-2.5 text-left hover:bg-black/4"
          >
            <FilePlus size={12} className="text-neutral-500" />
            New artwork
          </button>
        </div>
      )}
    </div>
  );
}
