import { color, createControls, range, toggle } from '@/lab/controls';

export const terminalControls = createControls('terminal-v1', {
  fontSize: range('Type', 9, 6, 16, 0.5, 'font px'),
  lineHeight: range('Type', 1.45, 1, 2.2, 0.01, 'line height'),
  ink: color('Type', '#e6e6e6', 'ink'),
  dim: range('Type', 0.42, 0, 1, 0.01, 'dim ink'),
  accent: color('Type', '#ffffff', 'accent'),
  pad: range('Type', 7, 0, 24, 0.5, 'padding px'),
  header: toggle('Type', true, 'headers'),

  speed: range('Pace', 1, 0, 4, 0.01, 'time scale'),
  logRate: range('Pace', 6, 0, 60, 0.1, 'log lines / s'),
  typeSpeed: range('Pace', 90, 5, 600, 1, 'typing chars / s'),
  hexScroll: range('Pace', 3, 0, 40, 0.1, 'hex rows / s'),
  flicker: range('Pace', 0.25, 0, 1, 0.01, 'hex flicker'),
  readoutRate: range('Pace', 2.5, 0, 20, 0.1, 'readout changes / s'),
  bigEvery: range('Pace', 2.2, 0.2, 10, 0.05, 'big text every s'),
  barSpeed: range('Pace', 0.35, 0, 3, 0.01, 'progress speed'),
  scramble: range('Pace', 0.35, 0, 2, 0.01, 'scramble s'),
  glitch: range('Pace', 0.12, 0, 3, 0.01, 'glitches / s'),

  wLog: range('Mix', 0.3, 0, 1, 0.01, 'log'),
  wHex: range('Mix', 0.15, 0, 1, 0.01, 'hex dump'),
  wReadout: range('Mix', 0.2, 0, 1, 0.01, 'readout'),
  wBig: range('Mix', 0.12, 0, 1, 0.01, 'big text'),
  wBars: range('Mix', 0.12, 0, 1, 0.01, 'progress'),
  wSpec: range('Mix', 0.2, 0, 1, 0.01, 'survey sheet'),
  wImage: range('Mix', 0.2, 0, 1, 0.01, 'work image'),

  imageEvery: range('Image', 7, 1, 30, 0.1, 'swap every s'),
  imageWipe: range('Image', 0.6, 0, 3, 0.01, 'wipe s'),
  imageOpacity: range('Image', 0.9, 0, 1, 0.01, 'opacity'),
  imageMono: range('Image', 0, 0, 1, 0.01, 'grayscale'),
  imageCaption: toggle('Image', true, 'caption'),

  seed: range('Grid', 5, 1, 999, 1, 'seed'),
  windows: range('Grid', 18, 1, 60, 1, 'windows'),
  gridRate: range('Grid', 1.2, 0, 20, 0.1, 'events / s'),
  burst: range('Grid', 1, 1, 8, 1, 'burst'),
  duration: range('Grid', 0.8, 0.05, 3, 0.01, 'duration s'),
  churn: range('Grid', 0.3, 0, 1, 0.01, 'births / deaths'),
  balance: range('Grid', 0.9, 0, 1, 0.01, 'uniform sizes'),
  minSize: range('Grid', 48, 8, 200, 1, 'min size px'),
  gap: range('Grid', 2, 0, 24, 0.5, 'gutter px'),
  tone: range('Grid', 0.08, 0, 0.5, 0.01, 'window tone'),
  border: range('Grid', 0.2, 0, 1, 0.01, 'border'),
  background: color('Grid', '#050505', 'background'),
});

export type TermValues = typeof terminalControls.values;
