import { Redo2, Undo2 } from 'lucide-react';
import { Fragment } from 'react';
import { TOOLS, type Tool } from './tools';
import { IconButton } from './ui';

// The tool rail, a column of its own against the layers sidebar.
export default function Toolbar({
  tool,
  onTool,
  onUndo,
  onRedo,
}: {
  tool: Tool;
  onTool: (t: Tool) => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return (
    <nav className="flex min-h-0 flex-col items-center gap-0.5 border-r border-black/8 bg-neutral-50 py-1.5">
      {TOOLS.map((group, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="my-1 h-px w-5 bg-black/8" />}
          {group.map(({ tool: t, key, label, icon: Icon }) => (
            <IconButton
              key={t}
              title={`${label} (${key.toUpperCase()})`}
              active={tool === t}
              onClick={() => onTool(t)}
              className="size-8!"
            >
              <Icon size={15} strokeWidth={1.75} />
            </IconButton>
          ))}
        </Fragment>
      ))}

      <div className="mt-auto flex flex-col items-center gap-0.5">
        <IconButton title="Undo (⌘Z)" onClick={onUndo} className="size-8!">
          <Undo2 size={14} />
        </IconButton>
        <IconButton title="Redo (⇧⌘Z)" onClick={onRedo} className="size-8!">
          <Redo2 size={14} />
        </IconButton>
      </div>
    </nav>
  );
}
