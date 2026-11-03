// A tuning store for one experiment: typed values, persisted to localStorage, read
// by the scene every frame without React re-rendering it. The panel subscribes;
// the render loop just reads `store.values`.

type Base = {
  group: string;
  label?: string;
  // Shown only while this holds, e.g. a stroke's colour while there is a
  // stroke. Hidden controls keep their values.
  when?: (values: Record<string, unknown>) => boolean;
};
export type RangeControl = Base & {
  kind: 'range';
  value: number;
  min: number;
  max: number;
  step: number;
};
export type ColorControl = Base & { kind: 'color'; value: string };
export type ToggleControl = Base & { kind: 'toggle'; value: boolean };
export type SelectControl = Base & {
  kind: 'select';
  value: string;
  options: { value: string; label: string }[];
};
export type TextControl = Base & { kind: 'text'; value: string };
export type Control =
  RangeControl | ColorControl | ToggleControl | SelectControl | TextControl;
export type Schema = Record<string, Control>;
export type Values<S extends Schema> = { [K in keyof S]: S[K]['value'] };

export const range = (
  group: string,
  value: number,
  min: number,
  max: number,
  step = (max - min) / 200,
  label?: string,
): RangeControl => ({ kind: 'range', group, value, min, max, step, label });
export const color = (
  group: string,
  value: string,
  label?: string,
): ColorControl => ({
  kind: 'color',
  group,
  value,
  label,
});
export const toggle = (
  group: string,
  value: boolean,
  label?: string,
): ToggleControl => ({
  kind: 'toggle',
  group,
  value,
  label,
});
export const select = (
  group: string,
  value: string,
  options: { value: string; label: string }[],
  label?: string,
): SelectControl => ({ kind: 'select', group, value, options, label });

export const when = <C extends Control>(
  control: C,
  test: (values: Record<string, unknown>) => boolean,
): C => ({ ...control, when: test });

export const text = (
  group: string,
  value: string,
  label?: string,
): TextControl => ({ kind: 'text', group, value, label });

export type ControlStore<S extends Schema> = {
  id: string;
  schema: S;
  values: Values<S>;
  defaults(): Values<S>;
  // Dev server only: writes the current values to `src/lab/presets/<id>.json`.
  saveDefaults(): Promise<void>;
  set<K extends keyof S>(key: K, value: S[K]['value']): void;
  reset(group?: string): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): Values<S>;
};

export function defaultsOf<S extends Schema>(schema: S): Values<S> {
  const out: Record<string, unknown> = {};
  for (const k in schema) out[k] = schema[k].value;
  return out as Values<S>;
}

// Saved values are only trusted where they still fit the schema: a renamed key
// is dropped, and a value of the wrong type or outside a narrowed range falls
// back to the default rather than putting the scene somewhere unreachable.
export function fit<S extends Schema>(
  raw: Record<string, unknown>,
  schema: S,
): Partial<Values<S>> {
  const out: Record<string, unknown> = {};
  for (const k in schema) {
    const c = schema[k];
    const v = raw[k];
    if (typeof v !== typeof c.value) continue;
    if (c.kind === 'range' && ((v as number) < c.min || (v as number) > c.max))
      continue;
    if (c.kind === 'select' && !c.options.some((o) => o.value === v)) continue;
    out[k] = v;
  }
  return out as Partial<Values<S>>;
}

function load<S extends Schema>(id: string, schema: S): Partial<Values<S>> {
  try {
    return fit(JSON.parse(localStorage.getItem(`lab:${id}`) ?? '{}'), schema);
  } catch {
    return {};
  }
}

// Presets committed by the panel's "Save defaults" (dev only, see
// `vite.config.ts`). A preset overrides the schema's defaults, so it's what a
// fresh browser, the deployed site and "Reset" all land on.
const PRESETS = import.meta.glob<Record<string, unknown>>('./presets/*.json', {
  eager: true,
  import: 'default',
});
const presetOf = (id: string) => PRESETS[`./presets/${id}.json`] ?? {};

export function createControls<S extends Schema>(
  id: string,
  schema: S,
): ControlStore<S> {
  let defaults = { ...defaultsOf(schema), ...fit(presetOf(id), schema) };
  const listeners = new Set<() => void>();
  const store: ControlStore<S> = {
    id,
    schema,
    values: { ...defaults, ...load(id, schema) },
    defaults: () => defaults,
    async saveDefaults() {
      const res = await fetch('/__lab/preset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, values: store.values }),
      });
      if (!res.ok) throw new Error(await res.text());
      defaults = { ...store.values };
      emit();
    },
    set(key, value) {
      store.values = { ...store.values, [key]: value };
      emit();
    },
    reset(group) {
      const next = { ...store.values };
      for (const k in schema) {
        if (!group || schema[k].group === group) next[k] = defaults[k];
      }
      store.values = next;
      emit();
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getSnapshot: () => store.values,
  };
  function emit() {
    localStorage.setItem(`lab:${id}`, JSON.stringify(store.values));
    listeners.forEach((l) => l());
  }
  return store;
}
