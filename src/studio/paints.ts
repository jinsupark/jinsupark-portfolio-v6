// Gradient stops, kept in a fill's values as one string so they fit the
// schema system: `#3d2b33 0, #fcdbe5 1` (colour, then position 0..1).
export type Stop = { color: string; at: number };

export function parseStops(s: string): Stop[] {
  const out = s
    .split(',')
    .map((part) => part.trim().split(/\s+/))
    .filter((p) => /^#[0-9a-f]{3,8}$/i.test(p[0] ?? ''))
    .map(([color, at]) => ({
      color,
      at: Math.min(1, Math.max(0, Number(at) || 0)),
    }))
    .sort((a, b) => a.at - b.at);
  return out.length >= 2
    ? out
    : [
        { color: '#3d2b33', at: 0 },
        { color: '#fcdbe5', at: 1 },
      ];
}

export const formatStops = (stops: Stop[]) =>
  [...stops]
    .sort((a, b) => a.at - b.at)
    .map((s) => `${s.color} ${+s.at.toFixed(3)}`)
    .join(', ');

// Images by URL, loaded once and shared.
const images = new Map<string, HTMLImageElement>();
export function imageOf(src: string) {
  let img = images.get(src);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.src = src;
    images.set(src, img);
  }
  return img;
}

// Where a `w`×`h` picture goes in a `bw`×`bh` box: covering it, inside it,
// or stretched to it, then zoomed about the centre.
export function placeIn(
  w: number,
  h: number,
  bw: number,
  bh: number,
  fit: string,
  zoom = 1,
) {
  const sx = bw / w;
  const sy = bh / h;
  const s =
    fit === 'fill' ? 0 : (fit === 'contain' ? Math.min : Math.max)(sx, sy);
  const dw = (fit === 'fill' ? bw : w * s) * zoom;
  const dh = (fit === 'fill' ? bh : h * s) * zoom;
  return { x: (bw - dw) / 2, y: (bh - dh) / 2, w: dw, h: dh };
}

// A gradient fill's values as CSS, for swatches and the stop bar.
export function gradientCss(v: Record<string, unknown>, angle?: number) {
  const stops = parseStops(String(v.stops ?? ''))
    .map((s) => `${s.color} ${s.at * 100}%`)
    .join(', ');
  return v.kind === 'radial' && angle === undefined
    ? `radial-gradient(circle, ${stops})`
    : `linear-gradient(${angle ?? Number(v.angle ?? 90)}deg, ${stops})`;
}

// A dropped or pasted file, made into a URL an artwork can keep: saved into
// the repo by the dev server (`/__lab/asset`), or, where that isn't running,
// held for this session only.
export async function uploadAsset(file: Blob, name = ''): Promise<string> {
  const ext = (name.split('.').pop() || file.type.split('/')[1] || '')
    .replace('jpeg', 'jpg')
    .replace('quicktime', 'mov')
    .toLowerCase();
  try {
    const res = await fetch('/__lab/asset', {
      method: 'POST',
      headers: { 'x-ext': ext },
      body: file,
    });
    if (res.ok) return ((await res.json()) as { url: string }).url;
  } catch {
    // No dev server: fall through to a session-only URL.
  }
  return URL.createObjectURL(file);
}

export const isVideoFile = (f: Blob) => f.type.startsWith('video/');
export const isMediaFile = (f: Blob) =>
  f.type.startsWith('image/') || isVideoFile(f);

// A picture's natural size, once it has loaded.
export function mediaSize(src: string, video: boolean) {
  return new Promise<{ w: number; h: number }>((ok) => {
    if (video) {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => ok({ w: v.videoWidth, h: v.videoHeight });
      v.onerror = () => ok({ w: 16, h: 9 });
      v.src = src;
    } else {
      const img = imageOf(src);
      const done = () =>
        ok({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
      if (img.complete && img.naturalWidth) done();
      else {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', () => ok({ w: 1, h: 1 }), { once: true });
      }
    }
  });
}
