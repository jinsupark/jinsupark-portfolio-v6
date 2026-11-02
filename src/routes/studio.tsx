import { createFileRoute, redirect } from '@tanstack/react-router';
import Studio from '@/studio/Studio';

// Dev only: the studio saves by writing into the repo through the dev server.
export const Route = createFileRoute('/studio')({
  validateSearch: (s: Record<string, unknown>): { work?: string } =>
    typeof s.work === 'string' ? { work: s.work } : {},
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw redirect({ to: '/', replace: true });
  },
  component: StudioPage,
});

function StudioPage() {
  const { work } = Route.useSearch();
  return <Studio key={work ?? ''} work={work} />;
}
