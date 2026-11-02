import { color, defaultsOf, range, text, type Values } from '@/lab/controls';
import { canvasLayer, defineLayer } from '@/studio/layer';

// Field Notes only: crop and registration marks with a title stamp, as if the
// piece were a print proof. Packaged with the artwork, so nothing else can
// change it and it can't change anything else.
const schema = {
  ink: color('Marks', '#c62a1f'),
  inset: range('Marks', 28, 0, 120, 1),
  length: range('Marks', 18, 4, 60, 1),
  weight: range('Marks', 1, 0.5, 4, 0.25),
  stamp: text('Stamp', 'FIELD NOTES — PROOF 01'),
  size: range('Stamp', 8, 5, 24, 0.5, 'type size'),
};

export default defineLayer({
  type: 'marks',
  label: 'Proof marks',
  version: 1,
  schema,
  initial: () => defaultsOf(schema),
  create: () =>
    canvasLayer<Values<typeof schema>>((ctx, w, h, _dt, v) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = ctx.fillStyle = v.ink;
      ctx.lineWidth = v.weight;
      const i = v.inset;
      const l = v.length;
      ctx.beginPath();
      for (const [x, y, sx, sy] of [
        [i, i, -1, -1],
        [w - i, i, 1, -1],
        [i, h - i, -1, 1],
        [w - i, h - i, 1, 1],
      ]) {
        ctx.moveTo(x, y + sy * 4);
        ctx.lineTo(x, y + sy * (4 + l));
        ctx.moveTo(x + sx * 4, y);
        ctx.lineTo(x + sx * (4 + l), y);
      }
      // Registration targets at the middle of the top and bottom edges.
      for (const y of [i / 2, h - i / 2]) {
        ctx.moveTo(w / 2 + 7, y);
        ctx.arc(w / 2, y, 7, 0, Math.PI * 2);
        ctx.moveTo(w / 2 - 11, y);
        ctx.lineTo(w / 2 + 11, y);
        ctx.moveTo(w / 2, y - 11);
        ctx.lineTo(w / 2, y + 11);
      }
      ctx.stroke();
      ctx.font = `${v.size}px "Geist Mono", monospace`;
      ctx.textBaseline = 'middle';
      ctx.fillText(v.stamp, i + 4 + l + 8, h - i);
    }),
});
