import { ART_PROJECTS } from '@/experiments/terminal/imagePool';
import { DemoVideos } from './demoVideo';

type Drawable = { el: CanvasImageSource; w: number; h: number };

// One picture for a renderer to draw from: the demo loop, or the first image
// of a project picked by seed. `get()` is null until it has pixels.
export class PictureSource {
  private videos = new DemoVideos();
  private img: HTMLImageElement | null = null;
  private imgFor = -1;

  get(kind: 'video' | 'project' | string, seed: number): Drawable | null {
    if (kind === 'video') {
      const v = this.videos.get(0);
      return DemoVideos.ready(v)
        ? { el: v, w: v.videoWidth, h: v.videoHeight }
        : null;
    }
    if (this.imgFor !== seed && ART_PROJECTS.length) {
      this.imgFor = seed;
      const project = ART_PROJECTS[seed % ART_PROJECTS.length];
      const img = new Image();
      this.img = null;
      void project.images[0]().then((url) => {
        img.onload = () => {
          if (this.imgFor === seed) this.img = img;
        };
        img.src = url;
      });
    }
    const img = this.img;
    return img ? { el: img, w: img.naturalWidth, h: img.naturalHeight } : null;
  }

  dispose() {
    this.videos.dispose();
  }
}

// Draws `src` covering `x y w h`, centred.
export function drawCover(
  ctx: CanvasRenderingContext2D,
  src: Drawable,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const s = Math.max(w / src.w, h / src.h);
  const dw = src.w * s;
  const dh = src.h * s;
  ctx.drawImage(src.el, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
