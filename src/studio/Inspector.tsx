import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  Blend,
  Radius,
  Scan,
  ChevronDown,
  Contrast,
  RotateCw,
  SquaresUnite,
} from 'lucide-react';
import { defaultsOf, fit } from '@/lab/controls';
import { newShape, type ShapeDoc } from './shape';
import { FilterList, ShadowList, ShapeSection, StrokeList } from './Appearance';
import {
  BLEND_MODES,
  fillsOf,
  filtersOf,
  outlineOf,
  primaryFill,
  shadowsOf,
  strokesOf,
  type Frame,
  type GroupDoc,
  type LayerDoc,
} from './document';
import FillList from './Fills';
import type { LayerType } from './layer';
import {
  combineSchema,
  compositeSchema,
  frameSchema,
  maskSchema,
  shapeSchema,
} from './studioSchemas';
import {
  ControlGroups,
  IconButton,
  NumberField,
  PanelHeader,
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
  const cs = combineSchema(layer, layers);
  const combine: Record<string, unknown> = {
    ...defaultsOf(cs),
    ...fit(layer.combine ?? {}, cs),
  };
  const combineOn = combine.op1 !== 'none';

  return (
    <>
      <PanelHeader
        title={layer.name}
        meta={`${fillLabel}${layer.shape ? ` · ${layer.shape.kind}` : ' · frame'}`}
      />

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
      <ShapeSection
        outline={outlineOf(layer)}
        onOutline={(outline) => patch({ outline })}
      >
        {layer.shape?.kind === 'path' && (
          <p className="text-neutral-400">
            A drawn path. Edit its points (A) or smear it (S).
          </p>
        )}
        {(!layer.shape || layer.shape.kind === 'rect') && (
          <CornerRadius
            shape={layer.shape ?? newShape('rect')}
            onShape={(shape) => patch({ shape })}
          />
        )}
        {layer.shape &&
          layer.shape.kind !== 'path' &&
          layer.shape.kind !== 'rect' && (
            <Rows
              schema={shapeSchema(layer.shape?.kind ?? 'rect')}
              values={layer.shape ?? newShape('rect')}
              onChange={(k, v) =>
                patch({
                  shape: { ...(layer.shape ?? newShape('rect')), [k]: v },
                })
              }
            />
          )}
      </ShapeSection>
      {combineOn && (
        <ControlGroups
          id="insp"
          schema={cs}
          values={combine}
          onChange={(k, v) => patch({ combine: { ...combine, [k]: v } })}
          onReset={() => patch({ combine: undefined })}
        />
      )}
      {layer.mask.source && (
        <ControlGroups
          id="insp"
          schema={maskSchema(layer, layers)}
          values={{ ...layer.mask, source: layer.mask.source ?? '' }}
          onChange={(k, v) =>
            patch({
              mask: {
                ...layer.mask,
                [k]: k === 'source' ? (v as string) || null : v,
              },
            })
          }
        />
      )}
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
const ALIGNS = [
  ['left', 'Align left', AlignStartVertical],
  ['hcenter', 'Align horizontal centres', AlignCenterVertical],
  ['right', 'Align right', AlignEndVertical],
  ['top', 'Align top', AlignStartHorizontal],
  ['vcenter', 'Align vertical centres', AlignCenterHorizontal],
  ['bottom', 'Align bottom', AlignEndHorizontal],
  ['hspace', 'Distribute horizontally', AlignHorizontalDistributeCenter],
  ['vspace', 'Distribute vertically', AlignVerticalDistributeCenter],
] as const;

export function SelectionInspector({
  layers,
  box,
  onBox,
  onPatch,
  onMask,
  onBoolean,
  onAlign,
}: {
  layers: LayerDoc[];
  box: Frame;
  onBox: (f: Frame) => void;
  onPatch: (p: Partial<LayerDoc>) => void;
  onMask: () => void;
  onBoolean: (op: string) => void;
  onAlign: (how: string) => void;
}) {
  const same = <T,>(f: (l: LayerDoc) => T) =>
    layers.every((l) => f(l) === f(layers[0])) ? f(layers[0]) : undefined;
  return (
    <>
      <PanelHeader
        title={`${layers.length} selected`}
        meta={`Layers · ${Math.round(box.w)} × ${Math.round(box.h)}`}
        aside={
          <>
            <IconButton
              title="Use the bottom layer as a mask for the others"
              onClick={onMask}
            >
              <Contrast size={13} />
            </IconButton>
            <label
              title="Combine shapes"
              className="relative flex h-6 cursor-pointer items-center gap-0.5 rounded-md px-1 text-neutral-500 hover:bg-black/5 hover:text-neutral-900"
            >
              <SquaresUnite size={13} />
              <ChevronDown size={10} />
              <select
                value=""
                onChange={(e) => e.target.value && onBoolean(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              >
                <option value="" disabled hidden>
                  Combine shapes…
                </option>
                <option value="union">Union</option>
                <option value="subtract">Subtract</option>
                <option value="intersect">Intersect</option>
                <option value="exclude">Exclude</option>
              </select>
            </label>
          </>
        }
      />
      <Section id="insp:Align" title="Align">
        <div className="flex items-center gap-1.5">
          {[ALIGNS.slice(0, 3), ALIGNS.slice(3, 6), ALIGNS.slice(6)].map(
            (group, i) => (
              <div
                key={i}
                className="flex items-center rounded-md bg-black/4 p-0.5"
              >
                {group.map(([how, title, Icon]) => (
                  <IconButton
                    key={how}
                    title={title}
                    onClick={() => onAlign(how)}
                    className="h-6! w-7!"
                  >
                    <Icon size={14} strokeWidth={1.75} />
                  </IconButton>
                ))}
              </div>
            ),
          )}
        </div>
      </Section>
      <LayoutSection frame={box} onFrame={onBox} rotate={false} />
      <BlendingSection
        opacity={same((l) => l.opacity) ?? layers[0].opacity}
        blend={same((l) => l.blend) ?? ''}
        onPatch={onPatch}
      />
    </>
  );
}

// A folder, edited like a layer: its layers' box, and the blending, shadows,
// filters and mask applied to them as one.
export function FolderInspector({
  folder,
  layers,
  box,
  onBox,
  onPatch,
}: {
  folder: GroupDoc;
  layers: LayerDoc[];
  box: Frame | null;
  onBox: (f: Frame) => void;
  onPatch: (p: Partial<GroupDoc>) => void;
}) {
  const mask = folder.mask ?? { source: null, mode: 'alpha', invert: false };
  // The mask schema lists every layer but the one it's for; a folder can use
  // any of them.
  const asLayer = { id: '', mask } as unknown as LayerDoc;
  return (
    <>
      <PanelHeader
        title={folder.name}
        meta={`Folder${box ? ` · ${Math.round(box.w)} × ${Math.round(box.h)}` : ''}`}
      />
      {box && <LayoutSection frame={box} onFrame={onBox} rotate={false} />}
      <BlendingSection
        opacity={folder.opacity ?? 1}
        blend={folder.blend ?? 'normal'}
        onPatch={(p) =>
          onPatch({
            ...(p.opacity !== undefined && { opacity: p.opacity }),
            ...(p.blend !== undefined && { blend: p.blend }),
          })
        }
      />
      <ShadowList
        shadows={folder.shadows ?? []}
        onShadows={(shadows) => onPatch({ shadows })}
      />
      <FilterList
        filters={folder.filters ?? []}
        onFilters={(filters) => onPatch({ filters })}
      />
      <ControlGroups
        id="insp:folder"
        schema={maskSchema(asLayer, layers)}
        values={{ ...mask, source: mask.source ?? '' }}
        closed={mask.source ? [] : ['Mask']}
        onChange={(k, v) =>
          onPatch({
            mask: { ...mask, [k]: k === 'source' ? (v as string) || null : v },
          })
        }
      />
    </>
  );
}

// Corner radius, one for all corners or one each (like Figma's independent
// corners: top-left, top-right, bottom-right, bottom-left).
function CornerRadius({
  shape,
  onShape,
}: {
  shape: ShapeDoc;
  onShape: (s: ShapeDoc) => void;
}) {
  const each = !!shape.radii;
  const field = (
    v: number,
    set: (v: number) => void,
    prefix: React.ReactNode,
  ) => (
    <NumberField
      value={v}
      onChange={set}
      min={0}
      max={2000}
      step={0.5}
      prefix={prefix}
    />
  );
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <div className="flex-1">
          {each ? (
            <span className="text-neutral-500">Corner radius</span>
          ) : (
            field(
              shape.radius,
              (radius) => onShape({ ...shape, radius }),
              <Radius size={11} />,
            )
          )}
        </div>
        <IconButton
          title={each ? 'One radius for all corners' : 'Independent corners'}
          active={each}
          onClick={() =>
            onShape(
              each
                ? { ...shape, radius: shape.radii![0], radii: undefined }
                : {
                    ...shape,
                    radii: [
                      shape.radius,
                      shape.radius,
                      shape.radius,
                      shape.radius,
                    ],
                  },
            )
          }
        >
          <Scan size={13} />
        </IconButton>
      </div>
      {each && (
        <div className="grid grid-cols-2 gap-1.5 pr-7">
          {(['↖', '↗', '↘', '↙'] as const).map((p, i) => (
            <div key={p}>
              {field(
                shape.radii![i],
                (v) => {
                  const radii = [...shape.radii!] as ShapeDoc['radii'] &
                    number[];
                  radii[i] = v;
                  onShape({ ...shape, radii });
                },
                p,
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
