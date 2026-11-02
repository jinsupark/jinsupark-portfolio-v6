import { color, createControls, range, toggle } from '@/lab/controls';

// The raised type on Home: text the colour of the ground, lifted by a highlight
// on the side facing the light and a shadow falling away from it.
export const raisedControls = createControls('home-raised-v1', {
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
  follow: toggle('Light', true, 'follow pointer'),
  height: range('Light', 520, 80, 2000, 10, 'light height px'),
  maxLength: range('Light', 1.6, 0.5, 5, 0.05, 'longest shadow'),
  minLength: range('Light', 0.25, 0, 1, 0.01, 'shadow overhead'),
  ease: range('Light', 7, 1, 30, 0.5, 'follow speed'),
  restAngle: range('Light', 235, 0, 360, 1, 'resting light angle'),
});

export type RaisedValues = typeof raisedControls.values;
