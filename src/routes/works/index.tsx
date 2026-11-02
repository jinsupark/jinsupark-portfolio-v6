import { createFileRoute, Link } from '@tanstack/react-router';
import { WORKS } from '@/works';

export const Route = createFileRoute('/works/')({
  component: Works,
});

// Thumbnails, not players: one WebGL context per live artwork adds up fast.
function Works() {
  return (
    <main className="min-h-dvh px-6 py-10 font-mono text-[10px] tracking-widest uppercase sm:px-12">
      <header className="mb-10 flex justify-between text-neutral-500">
        <Link to="/" className="hover:text-neutral-900">
          ← Jin Su Park
        </Link>
        <span>Works · {WORKS.length}</span>
      </header>
      <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
        {WORKS.map((w) => (
          <li key={w.slug}>
            <Link to="/works/$slug" params={{ slug: w.slug }} className="group">
              <div className="aspect-[4/5] overflow-hidden bg-neutral-200">
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
    </main>
  );
}
