import { createFileRoute, Link } from '@tanstack/react-router';
import { EXPERIMENTS } from '@/experiments/registry';

export const Route = createFileRoute('/experiments/')({
  component: ExperimentIndex,
});

function ExperimentIndex() {
  return (
    <main className="min-h-dvh bg-neutral-950 p-8 font-mono text-xs text-neutral-300">
      <h1 className="tracking-widest text-neutral-500 uppercase">
        Experiments
      </h1>
      <ul className="mt-8 space-y-6">
        {EXPERIMENTS.map((x) => (
          <li key={x.slug}>
            <Link
              to="/experiments/$slug"
              params={{ slug: x.slug }}
              className="group block max-w-md"
            >
              <div className="tracking-widest text-white uppercase group-hover:underline">
                {x.title} →
              </div>
              <p className="mt-1 text-neutral-500">{x.about}</p>
              <p className="mt-1 text-neutral-700">/experiments/{x.slug}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
