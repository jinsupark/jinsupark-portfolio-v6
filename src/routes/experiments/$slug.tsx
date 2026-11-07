import { Suspense } from 'react';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { EXPERIMENTS } from '@/experiments/registry';
import { SHADER_TYPES } from '@/studio/shaders';

export const Route = createFileRoute('/experiments/$slug')({
  beforeLoad: ({ params }) => {
    // An experiment that's also a shader opens in the shader playground.
    if (SHADER_TYPES[params.slug])
      throw redirect({
        to: '/shaders/$type',
        params: { type: params.slug },
        replace: true,
      });
    if (!EXPERIMENTS.some((e) => e.slug === params.slug && e.Component))
      throw redirect({
        to: '/projects',
        search: { tab: 'experiments' },
        replace: true,
      });
  },
  component: ExperimentPage,
});

function ExperimentPage() {
  const { slug } = Route.useParams();
  const Page = EXPERIMENTS.find((e) => e.slug === slug)!.Component!;
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
      <Page />
    </Suspense>
  );
}
