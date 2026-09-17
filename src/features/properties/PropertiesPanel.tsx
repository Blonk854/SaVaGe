import { Panel } from "../../shared/ui/Panel";
import { Slider } from "../../shared/ui/Slider";
import { Button } from "../../shared/ui/Button";
import { StatusBanner } from "../../shared/ui/StatusBanner";
import { mixedSelectionSummary } from "./mixedSelection";
import { useDocumentStore } from "../../shared/stores/documentStore";
import {
  defaultEffects,
  ensureEffects,
  type PathNode,
  type SceneNode,
  type TextNode,
} from "../../shared/document/types";
import { nodeWorldBounds, transformForWorldSize } from "../../shared/geometry/bounds";
import { PaintEditor, setNodePaint } from "./PaintEditor";
import { convertTextToOutlines } from "../tools/textToOutlines";
import { useUiStore } from "../../shared/stores/uiStore";

const emptyNodes: Array<SceneNode | undefined> = [];

function NumField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
}) {
  return (
    <label className="num">
      <span>{label}</span>
      <input
        type="number"
        defaultValue={Number(value.toFixed(2))}
        key={`${label}-${value}`}
        onBlur={(e) => onCommit(Number(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}

export function PropertiesPanel() {
  const selectionCount = useDocumentStore((s) => s.selection.length);
  const node = useDocumentStore((s) => {
    if (s.selection.length !== 1) return null;
    return s.doc.nodes[s.selection[0]] ?? null;
  });
  const mixedNodes = useDocumentStore((s) =>
    s.selection.length > 1 ? s.selection.map((id) => s.doc.nodes[id]) : emptyNodes,
  );
  const updateNode = useDocumentStore((s) => s.updateNode);
  const setNodeTransform = useDocumentStore((s) => s.setNodeTransform);

  if (selectionCount > 1) {
    const summary = mixedSelectionSummary(mixedNodes);
    return (
      <Panel title="Properties">
        <StatusBanner kind="mixed">
          <p className="sv-status__title">{summary.title}</p>
          <p>{summary.detail}</p>
        </StatusBanner>
      </Panel>
    );
  }

  if (!node) {
    return (
      <Panel title="Properties">
        <p className="sv-empty">Select an object to edit size, fill, and effects.</p>
      </Panel>
    );
  }

  const id = node.id;
  const bounds = nodeWorldBounds(useDocumentStore.getState().doc, id);
  const effects = ensureEffects(node);
  const hasFill = "fill" in node;
  const hasStroke = "stroke" in node;

  const patchEffects = (next: typeof effects) => {
    updateNode(id, { effects: next } as Partial<SceneNode>);
    useUiStore.getState().markDirty();
  };

  return (
    <Panel title="Properties">
      <div className="props">
        <div className="grid2">
          <NumField
            label="X"
            value={node.transform.x}
            onCommit={(v) => setNodeTransform(id, { ...node.transform, x: v })}
          />
          <NumField
            label="Y"
            value={node.transform.y}
            onCommit={(v) => setNodeTransform(id, { ...node.transform, y: v })}
          />
          <NumField
            label="W"
            value={bounds.w}
            onCommit={(v) => {
              if (!Number.isFinite(v) || v <= 0) return;
              setNodeTransform(id, transformForWorldSize(node.transform, bounds, v, bounds.h));
            }}
          />
          <NumField
            label="H"
            value={bounds.h}
            onCommit={(v) => {
              if (!Number.isFinite(v) || v <= 0) return;
              setNodeTransform(id, transformForWorldSize(node.transform, bounds, bounds.w, v));
            }}
          />
          <NumField
            label="R"
            value={node.transform.rotation}
            onCommit={(v) => setNodeTransform(id, { ...node.transform, rotation: v })}
          />
        </div>
        <Slider
          label="Opacity"
          min={0}
          max={1}
          step={0.01}
          value={node.opacity}
          onChange={(v) => updateNode(id, { opacity: v } as Partial<SceneNode>)}
        />

        {hasFill && (
          <PaintEditor
            label="Fill"
            paint={node.fill}
            meshSize={{ w: Math.max(20, bounds.w), h: Math.max(20, bounds.h) }}
            onChange={(paint) => {
              const patch = setNodePaint(node, "fill", paint);
              if (patch) updateNode(id, patch);
            }}
          />
        )}

        {hasStroke && (
          <>
            <PaintEditor
              label="Stroke"
              paint={node.stroke.paint}
              onChange={(paint) => {
                const patch = setNodePaint(node, "stroke", paint);
                if (patch) updateNode(id, patch);
              }}
            />
            <Slider
              label="Stroke width"
              min={0}
              max={40}
              step={0.5}
              value={node.stroke.width}
              onChange={(v) =>
                updateNode(id, {
                  stroke: { ...node.stroke, width: v },
                } as Partial<SceneNode>)
              }
            />
          </>
        )}

        {node.type === "path" && (
          <div className="fx">
            <span className="fx__title">Variable width</span>
            <p className="muted tip">
              Alt-drag a point (Direct Select) to taper. Or apply a profile:
            </p>
            <div className="grid2">
              <Button
                variant="subtle"
                onClick={() => {
                  const path = node as PathNode;
                  const subpaths = path.subpaths.map((sp) => ({
                    ...sp,
                    points: sp.points.map((p, i, arr) => {
                      const t = arr.length <= 1 ? 0 : i / (arr.length - 1);
                      const w = path.stroke.width * (0.35 + 0.65 * Math.sin(Math.PI * t));
                      return { ...p, strokeWidth: w };
                    }),
                  }));
                  updateNode(id, { subpaths } as Partial<PathNode>);
                  useUiStore.getState().markDirty();
                }}
              >
                Taper ends
              </Button>
              <Button
                variant="subtle"
                onClick={() => {
                  const path = node as PathNode;
                  const subpaths = path.subpaths.map((sp) => ({
                    ...sp,
                    points: sp.points.map((p) => {
                      const { strokeWidth: _, ...rest } = p;
                      return rest;
                    }),
                  }));
                  updateNode(id, { subpaths } as Partial<PathNode>);
                  useUiStore.getState().markDirty();
                }}
              >
                Clear profile
              </Button>
            </div>
          </div>
        )}

        <div className="fx">
          <span className="fx__title">Effects</span>
          <Slider
            label="Blur"
            min={0}
            max={24}
            step={0.5}
            value={effects.blur}
            onChange={(v) => patchEffects({ ...effects, blur: v })}
          />
          <label className="chk">
            <input
              type="checkbox"
              checked={effects.shadow.enabled}
              onChange={(e) =>
                patchEffects({
                  ...effects,
                  shadow: {
                    ...(node.effects?.shadow ?? defaultEffects().shadow),
                    enabled: e.target.checked,
                  },
                })
              }
            />
            Drop shadow
          </label>
          {effects.shadow.enabled && (
            <>
              <Slider
                label="Shadow blur"
                min={0}
                max={40}
                value={effects.shadow.blur}
                onChange={(v) =>
                  patchEffects({
                    ...effects,
                    shadow: { ...effects.shadow, blur: v },
                  })
                }
              />
              <div className="grid2">
                <NumField
                  label="SX"
                  value={effects.shadow.x}
                  onCommit={(v) =>
                    patchEffects({
                      ...effects,
                      shadow: { ...effects.shadow, x: v },
                    })
                  }
                />
                <NumField
                  label="SY"
                  value={effects.shadow.y}
                  onCommit={(v) =>
                    patchEffects({
                      ...effects,
                      shadow: { ...effects.shadow, y: v },
                    })
                  }
                />
              </div>
            </>
          )}
        </div>

        {node.type === "text" && (
          <>
            <label className="num">
              <span>Content</span>
              <input
                defaultValue={node.content}
                key={node.content}
                onBlur={(e) =>
                  updateNode(id, { content: e.target.value } as Partial<TextNode>)
                }
              />
            </label>
            <NumField
              label="Size"
              value={node.fontSize}
              onCommit={(v) => updateNode(id, { fontSize: v } as Partial<TextNode>)}
            />
            <NumField
              label="Weight"
              value={node.fontWeight}
              onCommit={(v) => updateNode(id, { fontWeight: v } as Partial<TextNode>)}
            />
            <Button
              variant="subtle"
              onClick={() => {
                void convertTextToOutlines(id).catch((e) => console.warn(e));
              }}
            >
              Convert to outlines
            </Button>
          </>
        )}

        {node.type === "symbolInstance" && (
          <div className="fx">
            <span className="fx__title">Symbol</span>
            <p className="muted tip">
              {useDocumentStore.getState().doc.symbols[node.symbolId]?.name ?? "Missing symbol"}
            </p>
            <Button
              variant="subtle"
              onClick={() => {
                useDocumentStore.getState().detachSymbol(id);
                useUiStore.getState().markDirty();
              }}
            >
              Detach to editable shapes
            </Button>
          </div>
        )}

        <div className="fx">
          <span className="fx__title">Clip</span>
          {node.clipPathId ? (
            <Button
              variant="subtle"
              onClick={() => {
                useDocumentStore.getState().releaseClipMask();
                useUiStore.getState().markDirty();
              }}
            >
              Release clip mask
            </Button>
          ) : (
            <p className="muted tip">
              Select targets then mask shape last → Object → Make Clip Mask
            </p>
          )}
        </div>
      </div>
      <style>{`
        .props { display: grid; gap: 0.75rem; }
        .grid2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.45rem;
        }
        .num {
          display: grid;
          gap: 0.2rem;
          font-size: 0.75rem;
          color: var(--fg-1);
        }
        .num input {
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 0.3rem 0.4rem;
          color: var(--fg-0);
        }
        .fx { display: grid; gap: 0.45rem; }
        .fx__title {
          font-size: 0.68rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--fg-1);
        }
        .chk {
          display: flex;
          gap: 0.35rem;
          align-items: center;
          font-size: 0.8rem;
          color: var(--fg-1);
        }
        .chk input { accent-color: var(--accent); }
        .tip { margin: 0; font-size: 0.72rem; line-height: 1.35; }
      `}</style>
    </Panel>
  );
}
