import { Blend, FolderPlus, RotateCw, Trash, X } from 'lucide-react';
import { defaultsOf, fit } from '@/lab/controls';
import { FilterList, ShadowList, StrokeList } from './Appearance';
import {
  BLEND_MODES,
  fillsOf,
  filtersOf,
  primaryFill,
  shadowsOf,
  strokesOf,
  type Frame,
  type LayerDoc,
} from './document';
import FillList from './Fills';
import type { LayerType } from './layer';
import {
  combineSchema,
  compositeSchema,
  edgeSchema,
  frameSchema,
  maskSchema,
  shapeSchema,
} from './studioSchemas';
import { resetGroup } from './tools';
import {
  ControlGroups,
  IconButton,
  Rows,
  SchemaNumber,
  Section,
  SelectField,
} from './ui';

export default function Inspector({
  layer,
  layers,
  types,
  onPatch,
}: {
  layer: LayerDoc;
  layers: LayerDoc[];
  types: Record<string, LayerType>;
  onPatch: (id: string, patch: Partial<LayerDoc>) => void;
}) {
  const patch = (p: Partial<LayerDoc>) => onPatch(layer.id, p);
  const main = primaryFill(layer);
  const fillLabel = main ? (types[main.type]?.label ?? main.type) : 'No fill';
  const edge: Record<string, unknown> = {
    ...defaultsOf(edgeSchema),
    ...fit(layer.edge ?? {}, edgeSchema),
  };
  const cs = combineSchema(layer, layers);
  const combine: Record<string, unknown> = {
    ...defaultsOf(cs),
    ...fit(layer.combine ?? {}, cs),
  };
  const edgeOn = Number(edge.tear) > 0 || Number(edge.feather) > 0;
  const combineOn = combine.op1 !== 'none';
  // Groups start shut unless the layer is using them: an edge or a boolean
  // you set up shouldn't hide behind a click. Once toggled, the choice sticks.
  const shut = [
    !edgeOn && 'Edge',
    !combineOn && 'Combine',
    !layer.mask.source && 'Mask',
  ].filter(Boolean) as string[];

  return (
    <>
      <div className="border-b border-black/6 px-3 pt-3 pb-2">
        <p className="truncate text-[13px] font-semibold text-neutral-900">
          {layer.name}
        </p>
        <p className="mt-0.5 truncate text-neutral-500">
          {fillLabel}
          {layer.shape ? ` · ${layer.shape.kind}` : ' · frame'}
        </p>
      </div>

      <LayoutSection
        frame={layer.frame}
        onFrame={(frame) => patch({ frame })}
      />
      <BlendingSection
        opacity={layer.opacity}
        blend={layer.blend}
        onPatch={patch}
      />
      <FillList
        fills={fillsOf(layer)}
        onFills={(fills) => patch({ fills })}
        types={types}
        onRetype={(f, from, to) => {
          // Keep a name the user gave the layer; follow its main fill
          // otherwise.
          if (main?.id === f.id && layer.name === from?.label)
            patch({ name: to.label });
        }}
      />
      <StrokeList
        strokes={strokesOf(layer)}
        onStrokes={(strokes) => patch({ strokes })}
        types={types}
      />
      <ShadowList
        shadows={shadowsOf(layer)}
        onShadows={(shadows) => patch({ shadows })}
      />
      <FilterList
        filters={filtersOf(layer)}
        onFilters={(filters) => patch({ filters })}
      />
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
    </>
  );
}

function LayoutSection({
  frame,
  onFrame,
  rotate = true,
}: {
  frame: Frame;
  onFrame: (f: Frame) => void;
  rotate?: boolean;
}) {
  return (
    <Section id="insp:Transform" title="Layout">
      <div className="grid grid-cols-2 gap-1.5">
        {(['x', 'y', 'w', 'h'] as const).map((k) => (
          <SchemaNumber
            key={k}
            control={frameSchema[k]}
            value={frame[k]}
            onChange={(v) => onFrame({ ...frame, [k]: v })}
            prefix={k.toUpperCase()}
          />
        ))}
        {rotate && (
          <SchemaNumber
            control={frameSchema.rot}
            value={frame.rot}
            onChange={(rot) => onFrame({ ...frame, rot })}
            prefix={<RotateCw size={11} />}
            suffix="°"
          />
        )}
      </div>
    </Section>
  );
}

function BlendingSection({
  opacity,
  blend,
  onPatch,
}: {
  opacity: number;
  blend: string;
  onPatch: (p: Partial<LayerDoc>) => void;
}) {
  return (
    <Section id="insp:Appearance" title="Blending">
      <div className="grid grid-cols-2 gap-1.5">
        <SchemaNumber
          control={compositeSchema.opacity}
          value={opacity}
          onChange={(opacity) => onPatch({ opacity })}
          factor={100}
          prefix={<Blend size={11} />}
          suffix="%"
        />
        <SelectField
          value={blend}
          options={[
            ...(blend ? [] : [{ value: '', label: 'mixed' }]),
            ...BLEND_MODES.map((m) => ({
              value: m,
              label: m.replace('-', ' '),
            })),
          ]}
          onChange={(v) => onPatch({ blend: v as LayerDoc['blend'] })}
        />
      </div>
    </Section>
  );
}

// More than one layer selected: their shared box and blending, and actions on
// the lot. Moving or resizing the box carries every layer along.
export function SelectionInspector({
  layers,
  box,
  onBox,
  onPatch,
  onGroup,
  onRemove,
}: {
  layers: LayerDoc[];
  box: Frame;
  onBox: (f: Frame) => void;
  onPatch: (p: Partial<LayerDoc>) => void;
  onGroup: () => void;
  onRemove: () => void;
}) {
  const same = <T,>(f: (l: LayerDoc) => T) =>
    layers.every((l) => f(l) === f(layers[0])) ? f(layers[0]) : undefined;
  return (
    <>
      <div className="flex items-center gap-0.5 border-b border-black/6 px-3 pt-3 pb-2">
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-neutral-900">
          {layers.length} layers
        </p>
        <IconButton title="Group into a folder (⌘G)" onClick={onGroup}>
          <FolderPlus size={12} />
        </IconButton>
        <IconButton
          title="Delete layers"
          onClick={onRemove}
          className="hover:text-red-500!"
        >
          <Trash size={12} />
        </IconButton>
      </div>
      <LayoutSection frame={box} onFrame={onBox} rotate={false} />
      <BlendingSection
        opacity={same((l) => l.opacity) ?? layers[0].opacity}
        blend={same((l) => l.blend) ?? ''}
        onPatch={onPatch}
      />
    </>
  );
}
