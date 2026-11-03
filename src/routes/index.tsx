import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { homeControls, type HomeValues } from '@/home/homeControls';
import { applySurface } from '@/home/light';
import { PagePainter } from '@/home/pagePainter';
import { PageWater } from '@/home/pageWater';
import ControlPanel from '@/lab/ControlPanel';
import { SITE } from '@/site';
import { WORKS } from '@/works';

export const Route = createFileRoute('/')({
  component: Home,
});

// Values that change how the page itself looks, so the copy must be redrawn.
const PAGE_KEYS: (keyof HomeValues)[] = [
  'ground',
  'headFill',
  'bodyFill',
  'shade',
  'headDepth',
  'bodyDepth',
  'highlight',
  'shadow',
  'drop',
  'blur',
  'angle',
  'length',
];
const pageKey = (v: HomeValues) => PAGE_KEYS.map((k) => v[k]).join('|');

// A title page set in raised type, then the works on a dot screen — drawn by
// WebGL with water sitting on it. The HTML below is the real page; once the
// copy is up it turns invisible and stays for links, selection and screen
// readers. If WebGL can't start, the HTML simply stays visible.
function Home() {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = root.current!;
    applySurface(el, homeControls.values);

    let water: PageWater | null = null;
    const page = new PagePainter();
    try {
      water = new PageWater(canvas.current!, page);
    } catch {
      return homeControls.subscribe(() =>
        applySurface(el, homeControls.values),
      );
    }
    const w = water;
    let alive = true;
    let ready = false;
    let repaintAt = 0;
    const repaint = () => {
      if (!alive) return;
      page.measure(el);
      page.paint(
        Math.min(devicePixelRatio, 2),
        Math.min(w.maxTexture, 8192),
        '',
      );
      w.pageChanged();
      ready = true;
      el.dataset.gl = 'live';
    };
    // Coalesce bursts (a slider drag, a resize) into one repaint a frame.
    const soon = () => {
      cancelAnimationFrame(repaintAt);
      repaintAt = requestAnimationFrame(repaint);
    };

    void document.fonts.ready.then(repaint);
    const imgs = [...el.querySelectorAll('img')];
    for (const img of imgs) img.addEventListener('load', soon);
    addEventListener('resize', soon);

    let key = pageKey(homeControls.values);
    const off = homeControls.subscribe(() => {
      const v = homeControls.values;
      applySurface(el, v);
      w.invalidate();
      const k = pageKey(v);
      if (k !== key) {
        key = k;
        soon();
      }
    });

    let raf = 0;
    let last = performance.now();
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (ready)
        w.frame(
          innerWidth,
          innerHeight,
          Math.min(devicePixelRatio, 2),
          (t - last) / 1000,
          homeControls.values,
        );
      last = t;
    };
    raf = requestAnimationFrame(frame);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(repaintAt);
      off();
      for (const img of imgs) img.removeEventListener('load', soon);
      removeEventListener('resize', soon);
      delete el.dataset.gl;
      w.dispose();
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvas}
        className="pointer-events-none fixed inset-0 size-full"
        aria-hidden
      />
      <main
        ref={root}
        className="relative min-h-dvh bg-(--ground) px-[2.5vw] pt-[2.6vw] pb-[2.5vw]"
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
                    className="underline decoration-[0.08em] underline-offset-[0.2em]"
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
                  data-paint
                  className="block w-[42%] bg-white p-[0.4vw] shadow-[0_10px_30px_-12px_rgb(0_0_0/0.35)]"
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
      </main>
      {import.meta.env.DEV && (
        <ControlPanel
          store={homeControls}
          actions={[
            {
              label: 'Re-seed drops',
              onClick: () =>
                homeControls.set(
                  'dropSeed',
                  1 + Math.floor(Math.random() * 999),
                ),
            },
          ]}
        />
      )}
    </>
  );
}
