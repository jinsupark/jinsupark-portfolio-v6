import {
  color,
  defaultsOf,
  range,
  select,
  text,
  type Values,
} from '@/lab/controls';
import demoUrl from '@/assets/video/poster-video.mp4';
import { canvasLayer, defineLayer } from '../layer';
import { imageOf, parseStops, placeIn } from '../paints';

// The first-party paints, the paint picker's tabs: a colour, a gradient, an
// image, a video. Everything else in the registry is a shader.

const solidSchema = {
  color: color('Solid', '#3d2b33'),
};

export const solidLayer = defineLayer({
  type: 'solid',
  label: 'Solid',
  version: 2,
  paint: 'solid',
  schema: solidSchema,
  initial: () => defaultsOf(solidSchema),
  create: () =>
    canvasLayer<Values<typeof solidSchema>>(
      (ctx, w, h, _dt, v) => {
        ctx.fillStyle = v.color;
        ctx.fillRect(0, 0, w, h);
      },
      undefined,
      true,
    ),
});

const gradientSchema = {
  kind: select('Gradient', 'linear', [
    { value: 'linear', label: 'Linear' },
    { value: 'radial', label: 'Radial' },
  ]),
  angle: range('Gradient', 90, 0, 360, 1, 'angle °'),
  stops: text('Gradient', '#3d2b33 0, #fcdbe5 1'),
};

export const gradientLayer = defineLayer({
  type: 'gradient',
  label: 'Gradient',
  version: 1,
  paint: 'gradient',
  schema: gradientSchema,
  initial: () => defaultsOf(gradientSchema),
  create: () =>
    canvasLayer<Values<typeof gradientSchema>>(
      (ctx, w, h, _dt, v) => {
        let g: CanvasGradient;
        if (v.kind === 'radial') {
          g = ctx.createRadialGradient(
            w / 2,
            h / 2,
            0,
            w / 2,
            h / 2,
            Math.hypot(w, h) / 2,
          );
        } else {
          const a = (v.angle * Math.PI) / 180;
          const r = (Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a))) / 2;
          const dx = Math.sin(a) * r;
          const dy = -Math.cos(a) * r;
          g = ctx.createLinearGradient(
            w / 2 - dx,
            h / 2 - dy,
            w / 2 + dx,
            h / 2 + dy,
          );
        }
        for (const s of parseStops(v.stops)) g.addColorStop(s.at, s.color);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      },
      undefined,
      true,
    ),
});

const fitOptions = [
  { value: 'cover', label: 'Fill' },
  { value: 'contain', label: 'Fit' },
  { value: 'fill', label: 'Stretch' },
];

const imageSchema = {
  src: text('Image', ''),
  fit: select('Image', 'cover', fitOptions),
  zoom: range('Image', 1, 1, 4, 0.01),
};

export const imageLayer = defineLayer({
  type: 'image',
  label: 'Image',
  version: 1,
  paint: 'image',
  schema: imageSchema,
  initial: () => defaultsOf(imageSchema),
  create: () =>
    canvasLayer<Values<typeof imageSchema>>((ctx, w, h, _dt, v) => {
      ctx.clearRect(0, 0, w, h);
      if (!v.src) return;
      const img = imageOf(v.src);
      if (!img.complete || !img.naturalWidth) return;
      const r = placeIn(
        img.naturalWidth,
        img.naturalHeight,
        w,
        h,
        v.fit,
        v.zoom,
      );
      ctx.drawImage(img, r.x, r.y, r.w, r.h);
    }),
});

const videoSchema = {
  src: text('Video', ''),
  fit: select('Video', 'cover', fitOptions),
  rate: range('Video', 1, 0.1, 3, 0.05, 'speed'),
  start: range('Video', 0, 0, 1, 0.01, 'start at'),
  zoom: range('Video', 1, 1, 4, 0.01),
};

export const videoLayer = defineLayer({
  type: 'video',
  label: 'Video',
  version: 2,
  paint: 'video',
  schema: videoSchema,
  initial: () => defaultsOf(videoSchema),
  create() {
    // One muted, looping element per fill; an empty `src` plays the demo loop
    // (what artworks made before videos had sources used).
    const el = document.createElement('video');
    el.muted = true;
    el.loop = true;
    el.playsInline = true;
    el.preload = 'auto';
    let started = -1;
    return canvasLayer<Values<typeof videoSchema>>(
      (ctx, w, h, dt, v) => {
        const src = v.src || demoUrl;
        if (el.getAttribute('src') !== src) {
          el.src = src;
          started = -1;
        }
        ctx.clearRect(0, 0, w, h);
        // The element plays on its own clock: hold it while the artwork is
        // paused (rendered with no time passing), run it otherwise.
        if (dt === 0) {
          if (!el.paused) el.pause();
        } else if (el.paused) void el.play().catch(() => {});
        if (el.readyState < 2 || !el.videoWidth) return;
        if (started !== v.start) {
          el.currentTime = el.duration * v.start;
          started = v.start;
        }
        if (el.playbackRate !== v.rate) el.playbackRate = v.rate;
        const r = placeIn(el.videoWidth, el.videoHeight, w, h, v.fit, v.zoom);
        ctx.drawImage(el, r.x, r.y, r.w, r.h);
      },
      () => {
        el.pause();
        el.removeAttribute('src');
        el.load();
      },
    );
  },
});
