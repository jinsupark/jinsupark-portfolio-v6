import { Suspense } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { EXPERIMENTS } from '@/experiments/registry';

export function ExperimentIndex() {
  return (
    <main className="min-h-dvh bg-neutral-950 p-8 font-mono text-xs text-neutral-300">
      <h1 className="tracking-widest text-neutral-500 uppercase">
        Experiments
      </h1>
      <ul className="mt-8 space-y-6">
        {EXPERIMENTS.map((x) => (
          <li key={x.slug}>
            <Link
              to={`/experiments/${x.slug}`}
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

export function ExperimentPage() {
  const { slug } = useParams();
  const x = EXPERIMENTS.find((e) => e.slug === slug);
  if (!x) return <Navigate to="/experiments" replace />;
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
      <x.Component />
    </Suspense>
  );
}
