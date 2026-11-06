import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { EXPERIMENTS } from '@/experiments/registry';
import { sizeOf } from '@/studio/document';
import type { LayerType } from '@/studio/layer';
import { SHADER_TYPES, SHADERS, shaderThumb } from '@/studio/shaders';
import { WORKS } from '@/works';

const TABS = [
  { id: 'works', label: 'Works' },
  { id: 'shaders', label: 'Shaders' },
  { id: 'experiments', label: 'Experiments' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export const Route = createFileRoute('/projects')({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } =>
    TABS.some((t) => t.id === s.tab) ? { tab: s.tab as Tab } : {},
  component: Projects,
});

// Experiments that aren't shaders yet: they own a three.js scene and keep
// their own pages until they run on the compositor.
const PAGE_ONLY = EXPERIMENTS.filter((x) => !SHADER_TYPES[x.slug]);
const aboutOf = (type: string) =>
  EXPERIMENTS.find((x) => x.slug === type)?.about;

function ShaderThumb({ t }: { t: LayerType }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    shaderThumb(t).then(
      (u) => live && setSrc(u),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [t]);
  return (
    <div className="aspect-4/5 overflow-hidden bg-neutral-200">
      {src && (
        <img
          src={src}
          alt={t.label}
          className="h-full w-full object-cover transition-opacity group-hover:opacity-85"
        />
      )}
    </div>
  );
}

function Projects() {
  const { tab = 'works' } = Route.useSearch();
  return (
    <main className="min-h-dvh px-6 py-10 font-mono text-[10px] tracking-widest uppercase sm:px-12">
      <header className="mb-10 flex items-center justify-between">
        <Link to="/" className="hover:underline">
          ← Jin Su Park
        </Link>
        <nav className="flex gap-6">
          {TABS.map((t) => (
            <Link
              key={t.id}
              to="/projects"
              search={{ tab: t.id }}
              className={
                t.id === tab
                  ? 'text-neutral-900 underline underline-offset-4'
                  : 'text-neutral-500 hover:text-neutral-900'
              }
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>

      {tab === 'works' && (
        <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
          {WORKS.map((w) => (
            <li key={w.slug}>
              <Link
                to="/works/$slug"
                params={{ slug: w.slug }}
                className="group"
              >
                <div
                  className="overflow-hidden bg-neutral-200"
                  style={{
                    aspectRatio: `${sizeOf(w.doc).w} / ${sizeOf(w.doc).h}`,
                  }}
                >
                  {w.thumb && (
                    <img
                      src={w.thumb}
                      alt={w.doc.title}
                      className="h-full w-full object-cover transition-opacity group-hover:opacity-85"
                    />
                  )}
                </div>
                <p className="mt-2">{w.doc.title}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {tab === 'shaders' && (
        <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
          {SHADERS.map((t) => (
            <li key={t.type}>
              <Link
                to="/shaders/$type"
                params={{ type: t.type }}
                className="group"
              >
                <ShaderThumb t={t} />
                <p className="mt-2">{t.label}</p>
                {aboutOf(t.type) && (
                  <p className="mt-1 tracking-normal text-neutral-500 normal-case">
                    {aboutOf(t.type)}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {tab === 'experiments' && (
        <ul className="max-w-md space-y-6">
          {PAGE_ONLY.map((x) => (
            <li key={x.slug}>
              <Link
                to="/experiments/$slug"
                params={{ slug: x.slug }}
                className="group block"
              >
                <span className="group-hover:underline">{x.title} →</span>
                <p className="mt-1 tracking-normal text-neutral-500 normal-case">
                  {x.about}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
