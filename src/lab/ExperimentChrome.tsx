import { Link } from '@tanstack/react-router';

// The label every experiment wears: where you are, and how to drive it.
export default function ExperimentChrome({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="pointer-events-none fixed top-4 left-4 z-40 font-mono text-[10px] tracking-widest text-white/70 uppercase mix-blend-difference">
      <Link
        to="/experiments"
        className="pointer-events-auto hover:text-white"
        onPointerDown={(e) => e.stopPropagation()}
      >
        ← Experiments
      </Link>
      <div className="mt-2 text-white">{title}</div>
      {hint && <div className="mt-1">{hint}</div>}
    </div>
  );
}
