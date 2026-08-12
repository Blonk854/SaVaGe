import type { Paint, SceneNode } from "../../shared/document/types";
import {
  defaultLinearGradient,
  defaultMeshGradient,
  defaultRadialGradient,
  solidFill,
} from "../../shared/document/types";
import { ColorSwatch } from "../../shared/ui/ColorSwatch";
import { primaryColor } from "../../shared/document/paint";
import { invalidateMeshCache } from "../../shared/document/meshPaint";

interface Props {
  label: string;
  paint: Paint;
  onChange: (paint: Paint) => void;
  /** Suggest mesh size from selection bounds */
  meshSize?: { w: number; h: number };
}

export function PaintEditor({ label, paint, onChange, meshSize }: Props) {
  const kind = paint.type;
  return (
    <div className="paint-ed">
      <div className="paint-ed__head">
        <span>{label}</span>
        <select
          value={kind}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "none") onChange({ type: "none" });
            else if (v === "solid") onChange(solidFill(primaryColor(paint)));
            else if (v === "linear") onChange(defaultLinearGradient());
            else if (v === "radial") onChange(defaultRadialGradient());
            else
              onChange(
                defaultMeshGradient(meshSize?.w ?? 120, meshSize?.h ?? 120),
              );
          }}
        >
          <option value="solid">Solid</option>
          <option value="linear">Linear</option>
          <option value="radial">Radial</option>
          <option value="mesh">Mesh</option>
          <option value="none">None</option>
        </select>
      </div>
      {paint.type === "solid" && (
        <ColorSwatch
          label="Color"
          value={paint.color}
          onChange={(color) => onChange({ ...paint, color })}
        />
      )}
      {(paint.type === "linear" || paint.type === "radial") && (
        <div className="paint-ed__stops">
          {paint.stops.map((s, i) => (
            <ColorSwatch
              key={i}
              label={`Stop ${i + 1}`}
              value={s.color}
              onChange={(color) => {
                const stops = paint.stops.map((st, idx) =>
                  idx === i ? { ...st, color } : st,
                );
                onChange({ ...paint, stops });
              }}
            />
          ))}
        </div>
      )}
      {paint.type === "mesh" && (
        <div className="paint-ed__stops">
          <p className="paint-ed__hint">
            {paint.columns}×{paint.rows} mesh — edit corner colors
          </p>
          {paint.points.map((p, i) => (
            <ColorSwatch
              key={i}
              label={`P${i}`}
              value={p.color}
              onChange={(color) => {
                invalidateMeshCache(paint);
                const points = paint.points.map((pt, idx) =>
                  idx === i ? { ...pt, color } : pt,
                );
                onChange({ ...paint, points });
              }}
            />
          ))}
        </div>
      )}
      <style>{`
        .paint-ed { display: grid; gap: 0.45rem; }
        .paint-ed__head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.75rem;
          color: var(--fg-1);
        }
        .paint-ed__head select {
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 0.2rem 0.35rem;
          color: var(--fg-0);
        }
        .paint-ed__stops { display: grid; gap: 0.4rem; }
        .paint-ed__hint {
          margin: 0;
          font-size: 0.7rem;
          color: var(--fg-1);
        }
      `}</style>
    </div>
  );
}

export function setNodePaint(
  node: SceneNode,
  which: "fill" | "stroke",
  paint: Paint,
): Partial<SceneNode> | null {
  if (which === "fill" && "fill" in node) return { fill: paint } as Partial<SceneNode>;
  if (which === "stroke" && "stroke" in node) {
    return { stroke: { ...node.stroke, paint } } as Partial<SceneNode>;
  }
  return null;
}
