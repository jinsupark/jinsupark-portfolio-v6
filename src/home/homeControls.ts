import { dropletControls } from '@/experiments/droplet/dropletControls';
import {
  color,
  createControls,
  range,
  toggle,
  type Schema,
} from '@/lab/controls';

const pick = <S extends Schema, const K extends keyof S>(s: S, keys: K[]) =>
  Object.fromEntries(keys.map((k) => [k, s[k]])) as Pick<S, K>;

// Everything tunable on Home, in one store so one tilde panel holds it all.
export const homeControls = createControls('home-v3', {
  // The raised type: text the colour of the ground, lifted by a highlight on
  // the side facing the light and a shadow falling away from it.
  ground: color('Surface', '#c6c4c9'),
  headFill: color('Surface', '#c6c4c9', 'headline fill'),
  bodyFill: color('Surface', '#c6c4c9', 'body fill'),
  shade: color('Surface', '#3a3644', 'shadow colour'),
  headDepth: range('Relief', 3, 0, 10, 0.1, 'headline depth px'),
  bodyDepth: range('Relief', 1.2, 0, 5, 0.05, 'body depth px'),
  highlight: range('Relief', 0.85, 0, 1, 0.01),
  shadow: range('Relief', 0.22, 0, 1, 0.01, 'contact shadow'),
  drop: range('Relief', 0.12, 0, 1, 0.01, 'drop shadow'),
  blur: range('Relief', 1, 0, 3, 0.01, 'drop softness'),
  // Direction to the light, 0° = right, measured clockwise on screen, so
  // 235° is the top left.
  angle: range('Relief', 235, 0, 360, 1, 'light angle'),
  length: range('Relief', 1, 0.2, 3, 0.05, 'shadow length'),

  // The water on the page: the droplet experiment's surface, scattered.
  // Water that stays put on the page: a few small beads.
  drops: range('Drops', 6, 0, 120, 1, 'drops per screen'),
  dropSeed: range('Drops', 7, 1, 999, 1, 'seed'),
  beadMin: range('Drops', 10, 4, 80, 1, 'bead min px'),
  beadMax: range('Drops', 26, 4, 120, 1, 'bead max px'),
  puddleShare: range('Drops', 0, 0, 1, 0.01, 'puddles'),
  puddleMin: range('Drops', 50, 10, 300, 1, 'puddle min px'),
  puddleMax: range('Drops', 110, 10, 400, 1, 'puddle max px'),
  lumpy: range('Drops', 0.6, 0, 1, 0.01, 'puddle irregularity'),
  squiggleShare: range('Drops', 0, 0, 1, 0.01, 'squiggles'),
  squiggleLength: range('Drops', 340, 40, 1200, 10, 'squiggle length px'),
  squiggleWidth: range('Drops', 25, 8, 80, 1, 'squiggle width px'),
  wiggle: range('Drops', 0.5, 0, 1.5, 0.01, 'squiggle wiggle'),
  spatter: range('Drops', 0, 0, 8, 0.1, 'spatter per big drop'),

  // Water that runs: drops trickling over the screen's glass like rain on a
  // windscreen, top right to bottom left, drying behind them.
  streams: range('Streams', 4, 0, 30, 1, 'streams on screen'),
  // Corner to corner of whatever screen it's on: steeper on a phone.
  diagonal: toggle('Streams', true, 'follow screen diagonal'),
  flowAngle: range('Streams', 132, 0, 360, 1, 'flow direction °'),
  spread: range('Streams', 8, 0, 90, 1, 'direction spread °'),
  speed: range('Streams', 160, 0, 600, 5, 'speed px/s'),
  stick: range('Streams', 0.5, 0, 1, 0.01, 'pace variation'),
  headMin: range('Streams', 12, 6, 100, 1, 'head min px'),
  headMax: range('Streams', 24, 6, 140, 1, 'head max px'),
  trailWidth: range('Streams', 0.85, 0.1, 1.5, 0.01, 'trail width'),
  trailLife: range('Streams', 6, 1, 60, 0.5, 'trail life s'),
  meander: range('Streams', 0.5, 0, 2, 0.01),
  loss: range('Streams', 0.35, 0, 8, 0.05, 'water lost px/s'),
  branch: range('Streams', 0.03, 0, 1, 0.01, 'branching per s'),
  pinch: range('Streams', 0.12, 0, 3, 0.01, 'beads left per s'),
  ...pick(dropletControls.schema, [
    'refract',
    'parallax',
    'chroma',
    'wobble',
    'wobbleSpeed',
    'specular',
    'shininess',
    'rim',
    'rimDark',
    'lightAngle',
    'tint',
    'tintAmount',
    'shadowX',
    'shadowY',
    'shadowColor',
    'caustics',
  ]),
  edge: range('Water', 8, 4, 90, 1, 'edge roundness'),
  thickness: range('Water', 22, 0, 160, 1),
  waterShadow: range('Shadow', 0.3, 0, 1, 0.01, 'shadow'),
  // Grey on the grey page; the experiment's blue reads as a colour cast here.
  shadowColor: color('Shadow', '#55535c', 'colour'),
});

export type HomeValues = typeof homeControls.values;
