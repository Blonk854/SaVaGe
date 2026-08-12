import { IconButton } from "../../shared/ui/IconButton";
import { useUiStore, type ToolId } from "../../shared/stores/uiStore";
import { beginShapeBuilder, clearShapeBuilderSession } from "./shapeBuilderTool";

const TOOLS: { id: ToolId; label: string; icon: string }[] = [
  { id: "select", label: "Select (V)", icon: "M4 4h8v8H4z M10 10l6 6" },
  { id: "directSelect", label: "Direct Select (A)", icon: "M8 3l5 14-4-2-2 4-2-4-4 2z" },
  { id: "pan", label: "Pan (H)", icon: "M8 4v8 M5 8h6 M4 12c0 3 2 5 4 5s4-2 4-5" },
  { id: "rect", label: "Rectangle (R)", icon: "M3 5h10v8H3z" },
  { id: "ellipse", label: "Ellipse (O)", icon: "M8 4a5 4 0 1 0 0.01 0" },
  { id: "line", label: "Line (L)", icon: "M3 13L13 3" },
  { id: "polygon", label: "Polygon", icon: "M8 2l5 4-2 6H5L3 6z" },
  { id: "star", label: "Star", icon: "M8 2l2 5h5l-4 3 2 5-5-3-5 3 2-5-4-3h5z" },
  { id: "pen", label: "Pen (P)", icon: "M3 13l8-8 2 2-8 8H3z" },
  { id: "pencil", label: "Pencil", icon: "M3 13l9-9 2 2-9 9H3z M10 5l2 2" },
  { id: "brush", label: "Brush (B)", icon: "M3 12c2-4 6-8 10-9-1 4-3 8-6 10-1 .7-2.5.8-4-1z" },
  {
    id: "patternBrush",
    label: "Pattern Brush",
    icon: "M2 8h3l2-3 2 3h3 M4 11h8 M5 14h6",
  },
  {
    id: "scatterBrush",
    label: "Scatter Brush",
    icon: "M4 5l2 3-2 1z M10 4l1 4 2-1z M7 10l3 3-2 2z",
  },
  {
    id: "shapeBuilder",
    label: "Shape Builder (S) — click regions, Enter to commit",
    icon: "M3 3h6v6H3zM9 9h4v4H9zM7 7l6 6M5 13h6v2H5z",
  },
  { id: "text", label: "Text (T)", icon: "M4 4h8M8 4v12" },
];

export function ToolsRail() {
  const activeTool = useUiStore((s) => s.activeTool);
  const setActiveTool = useUiStore((s) => s.setActiveTool);
  const mode = useUiStore((s) => s.mode);

  if (mode !== "edit") {
    return <aside className="tools-rail muted-rail" aria-hidden />;
  }

  return (
    <aside className="tools-rail panel-enter" aria-label="Tools">
      {TOOLS.map((t) => (
        <IconButton
          key={t.id}
          label={t.label}
          active={activeTool === t.id}
          onClick={() => {
            if (activeTool === "shapeBuilder" && t.id !== "shapeBuilder") {
              clearShapeBuilderSession();
            }
            setActiveTool(t.id);
            if (t.id === "shapeBuilder") void beginShapeBuilder();
          }}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d={t.icon} />
          </svg>
        </IconButton>
      ))}
      <style>{`
        .tools-rail {
          width: var(--tool-rail-w);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.2rem;
          padding: 0.45rem 0.3rem;
          background: var(--bg-1);
          border-right: 1px solid var(--border);
          overflow: auto;
        }
        .muted-rail { opacity: 0.35; pointer-events: none; }
      `}</style>
    </aside>
  );
}
