import { useEffect, useRef } from 'react';
import type { Artwork } from './document';

// Edits closer together than this are one undo step (a drag, a scrub).
const COALESCE_MS = 400;

// Undo and redo over the document. Every change of `doc` is recorded (runs of
// quick edits as one); `step` moves back or forward and gives the document it
// moved to, or null when there's nothing that way.
export function useHistory(
  doc: Artwork,
  setDoc: (d: Artwork) => void,
): (back: boolean) => Artwork | null {
  const hist = useRef({
    past: [] as Artwork[],
    future: [] as Artwork[],
    prev: null as Artwork | null,
    at: 0,
    replaying: false,
  });
  useEffect(() => {
    const h = hist.current;
    if (h.replaying) h.replaying = false;
    else if (h.prev && h.prev !== doc) {
      const now = performance.now();
      if (now - h.at > COALESCE_MS) {
        h.past.push(h.prev);
        if (h.past.length > 200) h.past.shift();
      }
      h.future = [];
      h.at = now;
    }
    h.prev = doc;
  }, [doc]);
  return (back) => {
    const h = hist.current;
    const next = (back ? h.past : h.future).pop();
    if (!next || !h.prev) return null;
    (back ? h.future : h.past).push(h.prev);
    h.replaying = true;
    h.at = 0;
    setDoc(next);
    return next;
  };
}
