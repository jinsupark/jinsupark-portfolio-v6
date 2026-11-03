import {
  Blend,
  Brush,
  Dices,
  Maximize,
  RotateCw,
  Spline,
  Trash,
  X,
} from 'lucide-react';
import { defaultsOf, fit, type Schema } from '@/lab/controls';
import { BLEND_MODES, fullFrame, NO_FX, type LayerDoc } from './document';
import type { LayerType } from './layer';
import {
  combineSchema,
  compositeSchema,
  edgeSchema,
  frameSchema,
  fxSchema,
  maskSchema,
  shaderSchema,
  shapeSchema,
} from './studioSchemas';
import type { Tool } from './tools';
import {
  ControlGroups,
  IconButton,
  Rows,
  SchemaNumber,
  Section,
  SelectField,
} from './ui';

const randomSeed = () => 1 + Math.floor(Math.random() * 999);

// One group of a schema back to its defaults, the rest untouched.
const resetGroup = (
  schema: Schema,
  values: Record<string, unknown>,
  group: string,
) => {
  const d = defaultsOf(schema);
  const next = { ...values };
  for (const k in schema) if (schema[k].group === group) next[k] = d[k];
  return next;
};

export default function Inspector({
  layer,
  layers,
  types,
  onPatch,
  onRemove,
  onTool,
}: {
  layer: LayerDoc;
  layers: LayerDoc[];
  types: Record<string, LayerType>;
  onPatch: (id: string, patch: Partial<LayerDoc>) => void;
  onRemove: (id: string) => void;
  onTool: (t: Tool) => void;
}) {
  const patch = (p: Partial<LayerDoc>) => onPatch(layer.id, p);
  const type = types[layer.type];
  const values = type
    ? { ...defaultsOf(type.schema), ...fit(layer.values, type.schema) }
    : {};
  const edge: Record<string, unknown> = {
    ...defaultsOf(edgeSchema),
    ...fit(layer.edge ?? {}, edgeSchema),
  };
  const cs = combineSchema(layer, layers);
  const combine: Record<string, unknown> = {
    ...defaultsOf(cs),
    ...fit(layer.combine ?? {}, cs),
  };
  const fxOn = JSON.stringify(layer.fx) !== JSON.stringify(NO_FX);
  const edgeOn = ['tear', 'core', 'stroke', 'feather'].some(
    (k) => Number(edge[k]) > 0,
  );
  const shadowOn = Number(edge.shadow) > 0;
  const combineOn = combine.op1 !== 'none';
  // Groups start shut unless the layer is using them: an edge or a boolean
  // you set up shouldn't hide behind a click. Once toggled, the choice sticks.
  const shut = [
    !edgeOn && 'Edge',
    !shadowOn && 'Shadow',
    !combineOn && 'Combine',
    !layer.mask.source && 'Mask',
    !fxOn && 'Filters',
  ].filter(Boolean) as string[];

  return (
    <>
      <div className="border-b border-black/6 px-3 pt-3 pb-2">
        <p className="truncate text-[13px] font-semibold text-neutral-900">
          {layer.name}
        </p>
        <div className="mt-0.5 flex items-center gap-0.5">
          <span className="min-w-0 flex-1 truncate text-neutral-500">
            {type?.label ?? layer.type}
            {layer.shape ? ` · ${layer.shape.kind}` : ' · frame'}
          </span>
          <IconButton title="Edit points (A)" onClick={() => onTool('edit')}>
            <Spline size={12} />
          </IconButton>
          <IconButton title="Smear (S)" onClick={() => onTool('smear')}>
            <Brush size={12} />
          </IconButton>
          <IconButton
            title="Fill the artwork"
            onClick={() => patch({ frame: fullFrame() })}
          >
            <Maximize size={12} />
          </IconButton>
          {type && 'seed' in type.schema && (
            <IconButton
              title="Re-seed"
              onClick={() =>
                patch({ values: { ...values, seed: randomSeed() } })
              }
            >
              <Dices size={12} />
            </IconButton>
          )}
          <IconButton
            title="Delete layer"
            onClick={() => onRemove(layer.id)}
            className="hover:text-red-500!"
          >
            <Trash size={12} />
          </IconButton>
        </div>
      </div>

      <ControlGroups
        id="insp"
        schema={shaderSchema(types)}
        values={{ type: layer.type, fillSpace: layer.fillSpace ?? 'shape' }}
        onChange={(k, v) => {
          if (k === 'fillSpace')
            return patch({ fillSpace: v as LayerDoc['fillSpace'] });
          const t = types[v as string];
          if (!t || v === layer.type) return;
          // Keep a name the user gave it; follow the shader otherwise.
          const named = layer.name !== type?.label;
          patch({
            type: v as string,
            version: t.version,
            values: { ...t.initial() },
            ...(!named && { name: t.label }),
          });
        }}
      />
      <Section id="insp:Transform" title="Layout">
        <div className="grid grid-cols-2 gap-1.5">
          {(['x', 'y', 'w', 'h'] as const).map((k) => (
            <SchemaNumber
              key={k}
              control={frameSchema[k]}
              value={layer.frame[k]}
              onChange={(v) => patch({ frame: { ...layer.frame, [k]: v } })}
              prefix={k.toUpperCase()}
            />
          ))}
          <SchemaNumber
            control={frameSchema.rot}
            value={layer.frame.rot}
            onChange={(rot) => patch({ frame: { ...layer.frame, rot } })}
            prefix={<RotateCw size={11} />}
            suffix="°"
          />
        </div>
      </Section>
      <Section id="insp:Appearance" title="Blending">
        <div className="grid grid-cols-2 gap-1.5">
          <SchemaNumber
            control={compositeSchema.opacity}
            value={layer.opacity}
            onChange={(opacity) => patch({ opacity })}
            factor={100}
            prefix={<Blend size={11} />}
            suffix="%"
          />
          <SelectField
            value={layer.blend}
            options={BLEND_MODES.map((m) => ({
              value: m,
              label: m.replace('-', ' '),
            }))}
            onChange={(v) => patch({ blend: v as LayerDoc['blend'] })}
          />
        </div>
      </Section>
      {layer.shape && (
        <Section
          id="insp:Shape"
          title="Shape"
          aside={
            <IconButton
              title="Back to a plain frame"
              onClick={() => patch({ shape: undefined })}
            >
              <X size={12} />
            </IconButton>
          }
        >
          {layer.shape.kind === 'path' ? (
            <p className="text-neutral-400">
              A drawn path. Edit its points (A) or smear it (S).
            </p>
          ) : (
            <Rows
              schema={shapeSchema(layer.shape.kind)}
              values={layer.shape}
              onChange={(k, v) => patch({ shape: { ...layer.shape!, [k]: v } })}
            />
          )}
        </Section>
      )}
      <ControlGroups
        id="insp"
        schema={edgeSchema}
        values={edge}
        closed={shut}
        onChange={(k, v) => patch({ edge: { ...edge, [k]: v } })}
        onReset={(g) => patch({ edge: resetGroup(edgeSchema, edge, g) })}
      />
      <ControlGroups
        id="insp"
        schema={cs}
        values={combine}
        closed={shut}
        onChange={(k, v) => patch({ combine: { ...combine, [k]: v } })}
        onReset={() => patch({ combine: undefined })}
      />
      <ControlGroups
        id="insp"
        schema={maskSchema(layer, layers)}
        values={{ ...layer.mask, source: layer.mask.source ?? '' }}
        closed={shut}
        onChange={(k, v) =>
          patch({
            mask: {
              ...layer.mask,
              [k]: k === 'source' ? (v as string) || null : v,
            },
          })
        }
      />
      <ControlGroups
        id="insp"
        schema={fxSchema}
        values={layer.fx}
        closed={shut}
        onChange={(k, v) => patch({ fx: { ...layer.fx, [k]: v } })}
        onReset={() => patch({ fx: { ...NO_FX } })}
      />

      {type && (
        <>
          <p className="border-b border-black/6 bg-black/3 px-3 pt-4 pb-1.5 font-medium text-neutral-500">
            {type.label}
          </p>
          <ControlGroups
            id={`insp:type:${layer.type}`}
            schema={type.schema}
            values={values}
            onChange={(k, v) => patch({ values: { ...values, [k]: v } })}
            onReset={(g) =>
              patch({ values: resetGroup(type.schema, values, g) })
            }
          />
        </>
      )}
    </>
  );
}
