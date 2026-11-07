import { describe, expect, it } from 'vitest';
import {
  boundsOf,
  groupLayers,
  layersOf,
  newLayer,
  withLists,
  type Artwork,
} from '../document';
import { formatStops, parseStops, placeIn } from '../paints';
import { aspectOf, newShape, verticesOf } from '../shape';

describe('shapes', () => {
  it('draws regular polygons at their natural proportions', () => {
    expect(aspectOf(newShape('polygon', 3))).toBeCloseTo(2 / Math.sqrt(3), 4);
    expect(aspectOf(newShape('polygon', 6))).toBeCloseTo(Math.sqrt(3) / 2, 4);
    expect(aspectOf(newShape('rect'))).toBeNull();
  });

  it('gives each corner its own radius', () => {
    const s = {
      ...newShape('rect'),
      radii: [40, 0, 20, 0] as [number, number, number, number],
    };
    const v = verticesOf(s, 200, 100);
    expect(v).toHaveLength(8);
    expect(v[0].x).toBeCloseTo(40 / 200); // top edge starts after the top-left curve
    expect(v[1].x).toBeCloseTo(1); // no top-right rounding
  });
});

describe('paints', () => {
  it('reads and writes gradient stops, in order', () => {
    const stops = parseStops('#ff0000 1, #00ff00 0, #0000ff 0.5');
    expect(stops.map((s) => s.at)).toEqual([0, 0.5, 1]);
    expect(parseStops(formatStops(stops))).toEqual(stops);
    expect(parseStops('nonsense')).toHaveLength(2);
  });

  it('places a picture to fill, fit or stretch', () => {
    expect(placeIn(200, 100, 100, 100, 'cover')).toMatchObject({
      w: 200,
      h: 100,
    });
    expect(placeIn(200, 100, 100, 100, 'contain')).toMatchObject({
      w: 100,
      h: 50,
    });
    expect(placeIn(200, 100, 100, 100, 'fill')).toMatchObject({
      w: 100,
      h: 100,
    });
  });
});

describe('documents', () => {
  const frame = (x: number) => ({ x, y: 0, w: 10, h: 10, rot: 0 });
  const doc = (): Artwork => ({
    version: 1,
    slug: 't',
    title: 't',
    about: '',
    background: '#fff',
    layers: [
      newLayer('a', frame(0), [], 'a'),
      newLayer('b', frame(20), [], 'b'),
      newLayer('c', frame(40), [], 'c'),
    ],
  });

  it('bounds rotated frames as they sit', () => {
    const b = boundsOf([{ x: 0, y: 0, w: 10, h: 10, rot: 45 }])!;
    expect(b.w).toBeCloseTo(10 * Math.SQRT2);
  });

  it('nests a folder when its layers are all grouped again', () => {
    let d = groupLayers(doc(), ['a', 'b'], 'Inner');
    const inner = d.groups![0].id;
    d = groupLayers(d, [`g:${inner}`, 'c'], 'Outer');
    const outer = d.groups!.find((g) => g.name === 'Outer')!;
    expect(d.groups!.find((g) => g.id === inner)!.parent).toBe(outer.id);
    expect(layersOf(d, [`g:${outer.id}`]).sort()).toEqual(['a', 'b', 'c']);
  });

  it('fills in missing layer lists', () => {
    const d = doc();
    // A draft from before a list existed.
    delete (d.layers[0] as Partial<(typeof d.layers)[0]>).outline;
    expect(withLists(d).layers[0].outline).toEqual([]);
  });
});
