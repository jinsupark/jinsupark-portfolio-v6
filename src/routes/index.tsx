import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { applySurface, startLight } from '@/home/light';
import { raisedControls } from '@/home/raisedControls';
import ControlPanel from '@/lab/ControlPanel';
import { SITE } from '@/site';
import { WORKS } from '@/works';

export const Route = createFileRoute('/')({
  component: Home,
});

// A title page set in raised type, then the works on a dot screen.
function Home() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current!;
    applySurface(el, raisedControls.values);
    const light = startLight(el, () => raisedControls.values);
    const off = raisedControls.subscribe(() => {
      applySurface(el, raisedControls.values);
      light.wake();
    });
    return () => {
      off();
      light.stop();
    };
  }, []);

  return (
    <main
      ref={root}
      className="min-h-dvh bg-(--ground) px-[2.5vw] pt-[2.6vw] pb-[2.5vw]"
    >
      <section className="grid gap-x-[2vw] gap-y-8 md:grid-cols-[40.5fr_31.5fr_28fr]">
        <div>
          <h1 className="raised raised-head max-w-[9.5em] text-[clamp(44px,5.9vw,104px)] leading-[0.93] font-bold tracking-[-0.045em]">
            {SITE.headline}
          </h1>
          <p className="raised mt-[1.6vw] text-[clamp(12px,1.25vw,19px)] leading-[1.35] font-medium tracking-[-0.01em]">
            {SITE.caption.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </p>
        </div>
        {SITE.bio.map((runs, i) => (
          <p
            key={i}
            className="raised max-w-[17em] text-[clamp(16px,1.7vw,27px)] leading-[1.3] font-medium tracking-[-0.015em]"
          >
            {runs.map((r, j) =>
              typeof r === 'string' ? (
                r
              ) : (
                <a
                  key={j}
                  href={r.href}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-[0.08em] underline-offset-[0.2em] transition-[filter] hover:brightness-95"
                >
                  {r.text}
                </a>
              ),
            )}
          </p>
        ))}
      </section>

      <section className="mt-[max(6rem,21vw)] grid md:grid-cols-2">
        {(WORKS.length % 2 ? [...WORKS, null] : WORKS).map((w, i) => (
          <div
            key={w?.slug ?? `empty-${i}`}
            className="dot-field relative grid aspect-4/3 place-items-center border-(--ground) md:odd:border-r-2"
          >
            {w && (
              <Link
                to="/works/$slug"
                params={{ slug: w.slug }}
                className="block w-[42%] bg-white p-[0.4vw] shadow-[0_10px_30px_-12px_rgb(0_0_0/0.35)] transition-transform hover:-translate-y-1"
              >
                {w.thumb ? (
                  <img
                    src={w.thumb}
                    alt={w.doc.title}
                    className="block w-full"
                  />
                ) : (
                  <span className="block aspect-4/5" />
                )}
              </Link>
            )}
          </div>
        ))}
      </section>

      <ControlPanel store={raisedControls} />
    </main>
  );
}
