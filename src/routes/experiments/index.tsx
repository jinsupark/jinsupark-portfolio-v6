import { createFileRoute, redirect } from '@tanstack/react-router';

// The experiments list now lives on the projects page.
export const Route = createFileRoute('/experiments/')({
  beforeLoad: () => {
    throw redirect({
      to: '/projects',
      search: { tab: 'experiments' },
      replace: true,
    });
  },
});
