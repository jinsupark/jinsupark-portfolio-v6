import demoUrl from '@/assets/video/poster-video.mp4';

// The demo loop, as muted inline <video>s. Each index is its own element
// started at a different point in the loop, so several surfaces showing the
// video don't all show the same frame.
export class DemoVideos {
  private els: HTMLVideoElement[] = [];

  get(i: number) {
    let el = this.els[i];
    if (!el) {
      el = document.createElement('video');
      el.src = demoUrl;
      el.muted = true;
      el.loop = true;
      el.playsInline = true;
      el.preload = 'auto';
      el.addEventListener(
        'loadedmetadata',
        () => {
          el.currentTime = el.duration * ((i * 0.37) % 1) || 0;
          void el.play().catch(() => {});
        },
        { once: true },
      );
      this.els[i] = el;
    }
    return el;
  }

  // Has a frame to draw.
  static ready(el: HTMLVideoElement) {
    return el.readyState >= 2 && el.videoWidth > 0;
  }

  dispose() {
    // Sparse: callers ask for whichever indices they need.
    for (const el of this.els) {
      if (!el) continue;
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    this.els = [];
  }
}
