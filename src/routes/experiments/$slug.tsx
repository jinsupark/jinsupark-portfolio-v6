import { Suspense } from 'react';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { EXPERIMENTS } from '@/experiments/registry';

export const Route = createFileRoute('/experiments/$slug')({
  beforeLoad: ({ params }) => {
    if (!EXPERIMENTS.some((e) => e.slug === params.slug))
      throw redirect({ to: '/experiments', replace: true });
  },
  component: ExperimentPage,
});

function ExperimentPage() {
  const { slug } = Route.useParams();
  const x = EXPERIMENTS.find((e) => e.slug === slug)!;
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
      <x.Component />
    </Suspense>
  );
}
