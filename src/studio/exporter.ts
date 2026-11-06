import { Compositor } from './compositor';
import { isVideo, sizeOf, type Artwork, type ExportDoc } from './document';
import type { LayerType } from './layer';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The artwork as an image file, `scale` times its design size. It renders in
// a compositor of its own, so the player on screen isn't touched, and runs a
// few frames first so layers that load images or video have them.
export async function renderArtwork(
  doc: Artwork,
  types: Record<string, LayerType>,
  e: ExportDoc,
): Promise<Blob> {
  if (isVideo(e)) return recordArtwork(doc, types, e);
  const { scale, format } = e;
  const size = sizeOf(doc);
  const w = Math.round(size.w * scale);
  const h = Math.round(size.h * scale);
  const canvas = document.createElement('canvas');
  const c = new Compositor(canvas);
  try {
    c.setSize(w, h, 1);
    c.setDocument(doc, types);
    for (let i = 0; i < 8; i++) {
      c.render(1 / 60);
      await wait(60);
    }
    c.render(0);
    // Read back in the same task as the render, before the buffer clears.
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    out.getContext('2d')!.drawImage(canvas, 0, 0);
    const type = format === 'jpg' ? 'image/jpeg' : 'image/png';
    return await new Promise<Blob>((ok, fail) =>
      out.toBlob(
        (b) => (b ? ok(b) : fail(new Error('export failed'))),
        type,
        0.92,
      ),
    );
  } finally {
    c.dispose();
  }
}

// The artwork playing, recorded for `duration` seconds. It plays in real
// time in a compositor of its own while the browser encodes the canvas, so
// a slow machine records fewer frames rather than a slower piece.
async function recordArtwork(
  doc: Artwork,
  types: Record<string, LayerType>,
  { scale, format, duration = 5 }: ExportDoc,
): Promise<Blob> {
  const mime = (
    format === 'mp4'
      ? ['video/mp4;codecs=avc1', 'video/mp4']
      : ['video/webm;codecs=vp9', 'video/webm']
  ).find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime)
    throw new Error(`${format.toUpperCase()} isn't supported in this browser`);
  const size = sizeOf(doc);
  // Even sizes, which video encoders need.
  const w = Math.round((size.w * scale) / 2) * 2;
  const h = Math.round((size.h * scale) / 2) * 2;
  const canvas = document.createElement('canvas');
  const c = new Compositor(canvas);
  try {
    c.setSize(w, h, 1);
    c.setDocument(doc, types);
    // A moment first, so images and video in the layers have loaded.
    for (let i = 0; i < 20; i++) {
      c.render(1 / 60);
      await wait(25);
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(canvas.captureStream(60), {
      mimeType: mime,
      videoBitsPerSecond: Math.min(40e6, w * h * 12),
    });
    rec.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
    const done = new Promise<void>((ok) => (rec.onstop = () => ok()));
    rec.start();
    const t0 = performance.now();
    let last = t0;
    await new Promise<void>((ok) => {
      const frame = (t: number) => {
        c.render(Math.min(t - last, 100) / 1000);
        last = t;
        if (t - t0 < duration * 1000) requestAnimationFrame(frame);
        else ok();
      };
      requestAnimationFrame(frame);
    });
    rec.stop();
    await done;
    return new Blob(chunks, { type: mime.split(';')[0] });
  } finally {
    c.dispose();
  }
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const exportName = (doc: Artwork, e: ExportDoc) =>
  `${doc.slug}${e.scale === 1 ? '' : `@${e.scale}x`}.${e.format}`;
