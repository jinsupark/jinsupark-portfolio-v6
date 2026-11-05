import { Compositor } from './compositor';
import { DESIGN, type Artwork, type ExportDoc } from './document';
import type { LayerType } from './layer';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The artwork as an image file, `scale` times its design size. It renders in
// a compositor of its own, so the player on screen isn't touched, and runs a
// few frames first so layers that load images or video have them.
export async function renderArtwork(
  doc: Artwork,
  types: Record<string, LayerType>,
  { scale, format }: ExportDoc,
): Promise<Blob> {
  const w = Math.round(DESIGN.w * scale);
  const h = Math.round(DESIGN.h * scale);
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
