import {
  color,
  defaultsOf,
  range,
  select,
  toggle,
  type Values,
} from '@/lab/controls';
import { DemoVideos } from '@/lab/demoVideo';
import { canvasLayer, defineLayer } from '../layer';

const solidSchema = {
  color: color('Fill', '#3d2b33'),
  gradient: toggle('Fill', false),
  color2: color('Fill', '#fcdbe5', 'to colour'),
  angle: range('Fill', 90, 0, 360, 1, 'angle °'),
};

export const solidLayer = defineLayer({
  type: 'solid',
  label: 'Solid / gradient',
  version: 1,
  schema: solidSchema,
  initial: () => defaultsOf(solidSchema),
  create: () =>
    canvasLayer<Values<typeof solidSchema>>(
      (ctx, w, h, _dt, v) => {
        if (!v.gradient) {
          ctx.fillStyle = v.color;
        } else {
          const a = (v.angle * Math.PI) / 180;
          const r = (Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a))) / 2;
          const dx = Math.sin(a) * r;
          const dy = -Math.cos(a) * r;
          const g = ctx.createLinearGradient(
            w / 2 - dx,
            h / 2 - dy,
            w / 2 + dx,
            h / 2 + dy,
          );
          g.addColorStop(0, v.color);
          g.addColorStop(1, v.color2);
          ctx.fillStyle = g;
        }
        ctx.fillRect(0, 0, w, h);
      },
      undefined,
      true,
    ),
});

const videoSchema = {
  fit: select('Video', 'cover', [
    { value: 'cover', label: 'Cover' },
    { value: 'contain', label: 'Contain' },
  ]),
  rate: range('Video', 1, 0.1, 3, 0.05, 'speed'),
  start: range('Video', 0, 0, 1, 0.01, 'start at'),
  zoom: range('Video', 1, 1, 4, 0.01),
};

export const videoLayer = defineLayer({
  type: 'video',
  label: 'Demo video',
  version: 1,
  schema: videoSchema,
  initial: () => defaultsOf(videoSchema),
  create() {
    const videos = new DemoVideos();
    const el = videos.get(0);
    let started = -1;
    return canvasLayer<Values<typeof videoSchema>>(
      (ctx, w, h, _dt, v) => {
        ctx.clearRect(0, 0, w, h);
        // The element plays on its own clock: hold it while the artwork is
        // paused (rendered with no time passing), run it otherwise.
        if (_dt === 0) {
          if (!el.paused) el.pause();
        } else if (el.paused) void el.play().catch(() => {});
        if (!DemoVideos.ready(el)) return;
        if (started !== v.start) {
          el.currentTime = el.duration * v.start;
          started = v.start;
        }
        if (el.playbackRate !== v.rate) el.playbackRate = v.rate;
        const vw = el.videoWidth;
        const vh = el.videoHeight;
        const fit = v.fit === 'cover' ? Math.max : Math.min;
        const s = fit(w / vw, h / vh) * v.zoom;
        ctx.drawImage(el, (w - vw * s) / 2, (h - vh * s) / 2, vw * s, vh * s);
      },
      () => videos.dispose(),
    );
  },
});
