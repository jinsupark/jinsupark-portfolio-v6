import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import ArtworkPlayer from '@/studio/ArtworkPlayer';
import { workOf } from '@/works';

export const Route = createFileRoute('/works/$slug')({
  beforeLoad: ({ params }) => {
    if (!workOf(params.slug)) throw redirect({ to: '/works', replace: true });
  },
  component: WorkPage,
});

function WorkPage() {
  const { slug } = Route.useParams();
  const work = workOf(slug)!;
  return (
    <main className="fixed inset-0 grid grid-rows-[auto_1fr_auto] font-mono text-[10px] tracking-widest uppercase">
      <header className="flex justify-between px-6 py-4 text-neutral-500">
        <Link to="/works" className="hover:text-neutral-900">
          ← Works
        </Link>
        {import.meta.env.DEV && (
          <Link
            to="/studio"
            search={{ work: slug }}
            className="hover:text-neutral-900"
          >
            Edit in studio
          </Link>
        )}
      </header>
      <ArtworkPlayer doc={work.doc} className="min-h-0 px-6" />
      <footer className="mx-auto max-w-md px-6 py-5 text-center">
        <p>{work.doc.title}</p>
        {work.doc.about && (
          <p className="mt-2 tracking-normal text-neutral-500 normal-case">
            {work.doc.about}
          </p>
        )}
      </footer>
    </main>
  );
}
