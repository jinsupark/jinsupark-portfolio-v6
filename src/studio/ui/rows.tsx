import { ColorField } from './color';
import { type Control, type Schema } from '@/lab/controls';
import { sentence, words, rangeOf } from './shared';
import { Section, NumberField, TextField, Labeled } from './basics';
import { SelectField } from './menu';

export function Row({
  name,
  control,
  value,
  onChange,
}: {
  name: string;
  control: Control;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = control.label ?? words(name);
  switch (control.kind) {
    case 'range':
      return (
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_3.5rem] items-center gap-2">
          <span className="truncate text-neutral-500">{sentence(label)}</span>
          <input
            type="range"
            min={control.min}
            max={control.max}
            step={control.step}
            value={value as number}
            onChange={(e) => onChange(Number(e.target.value))}
            className="studio-range"
          />
          <NumberField
            value={value as number}
            onChange={onChange}
            {...rangeOf(control)}
          />
        </div>
      );
    case 'color':
      return (
        <Labeled label={label}>
          <ColorField value={value as string} onChange={onChange} />
        </Labeled>
      );
    case 'toggle':
      return (
        <Labeled label={label}>
          <input
            type="checkbox"
            checked={value as boolean}
            onChange={(e) => onChange(e.target.checked)}
            className="justify-self-start accent-neutral-800"
          />
        </Labeled>
      );
    case 'text':
      return (
        <Labeled label={label}>
          <TextField value={value as string} onChange={onChange} />
        </Labeled>
      );
    case 'select':
      return (
        <Labeled label={label}>
          <SelectField
            value={value as string}
            options={control.options}
            onChange={onChange}
          />
        </Labeled>
      );
  }
}

// A schema's rows with no group headers, for a section that has its own.
export function Rows({
  schema,
  values,
  onChange,
}: {
  schema: Schema;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return Object.keys(schema)
    .filter((k) => !schema[k].when || schema[k].when!(values))
    .map((key) => (
      <Row
        key={key}
        name={key}
        control={schema[key]}
        value={values[key]}
        onChange={(v) => onChange(key, v)}
      />
    ));
}

// A schema as one section per group. A control whose `when` fails is left
// out, and a group with nothing left to show goes too. `closed` lists groups
// that start shut.
export function ControlGroups({
  schema,
  values,
  onChange,
  onReset,
  titles = {},
}: {
  schema: Schema;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  onReset?: (group: string) => void;
  titles?: Record<string, string>;
}) {
  const groups: [string, string[]][] = [];
  for (const key of Object.keys(schema)) {
    if (schema[key].when && !schema[key].when!(values)) continue;
    const g = schema[key].group;
    let entry = groups.find(([name]) => name === g);
    if (!entry) groups.push((entry = [g, []]));
    entry[1].push(key);
  }
  return groups.map(([group, keys]) => (
    <Section
      key={group}
      title={titles[group] ?? group}
      onReset={onReset && (() => onReset(group))}
    >
      {keys.map((key) => (
        <Row
          key={key}
          name={key}
          control={schema[key]}
          value={values[key]}
          onChange={(v) => onChange(key, v)}
        />
      ))}
    </Section>
  ));
}
