import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";
import { alignDisabledReason, alignSelection, type AlignMode } from "./align";
import {
  clearBooleanPreview,
  previewBooleanOp,
  runBooleanOp,
  type BooleanOp,
} from "./booleanOps";
import { commitShapeBuilder } from "./shapeBuilderTool";
import type { NoticeKind } from "../../shared/ui/notice";

const ALIGN_ACTIONS: { mode: AlignMode; label: string; icon: string }[] = [
  { mode: "left", label: "Align left", icon: "M2 2v12 M5 4h8v3H5z M5 9h5v3H5z" },
  { mode: "center", label: "Align horizontal centers", icon: "M8 2v12 M4 4h8v3H4z M5 9h6v3H5z" },
  { mode: "right", label: "Align right", icon: "M14 2v12 M3 4h8v3H3z M6 9h5v3H6z" },
  { mode: "top", label: "Align top", icon: "M2 2h12 M4 5h3v8H4z M9 5h3v5H9z" },
  { mode: "middle", label: "Align vertical centers", icon: "M2 8h12 M4 3h3v10H4z M9 5h3v6H9z" },
  { mode: "bottom", label: "Align bottom", icon: "M2 14h12 M4 3h3v8H4z M9 6h3v5H9z" },
  { mode: "distribute-h", label: "Distribute horizontally", icon: "M2 3v10 M14 3v10 M5 6h2v4H5z M9 6h2v4H9z" },
  { mode: "distribute-v", label: "Distribute vertically", icon: "M3 2h10 M3 14h10 M6 5h4v2H6z M6 9h4v2H6z" },
];

const BOOLEAN_ACTIONS: { op: BooleanOp; label: string; title: string }[] = [
  { op: "union", label: "Unite", title: "Unite: combine selected shapes" },
  { op: "intersect", label: "Intersect", title: "Intersect: keep overlapping areas" },
  { op: "subtract", label: "Subtract", title: "Subtract: first shape minus the others" },
  { op: "exclude", label: "Exclude", title: "Exclude: keep non-overlapping areas" },
];

const BOOLEAN_DISABLED = "Select two filled shapes to combine";
const SHAPE_BUILDER_DISABLED = "Start Shape Builder (S), then click regions to commit";

interface Props {
  onNotify: (message: string, kind?: NoticeKind) => void;
}

export function AlignBooleanBar({ onNotify }: Props) {
  const selectionCount = useDocumentStore((s) => s.selection.length);
  const shapeBuilderActive = useUiStore((s) => s.shapeBuilderActive);

  const onBoolean = async (op: BooleanOp) => {
    try {
      await runBooleanOp(op);
      onNotify(`Boolean ${op} applied`, "success");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : String(error), "error");
    }
  };

  return (
    <div className="ops-bar">
      <span className="ops-label">Align</span>
      <div className="align-bar" role="group" aria-label="Align selection">
        {ALIGN_ACTIONS.map((action) => {
          const reason = alignDisabledReason(action.mode, selectionCount);
          return (
            <button
              key={action.mode}
              type="button"
              className="ops-icon"
              aria-label={action.label}
              title={reason ?? action.label}
              disabled={Boolean(reason)}
              onClick={() => alignSelection(action.mode)}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d={action.icon} />
              </svg>
            </button>
          );
        })}
      </div>
      <span className="ops-label">Boolean</span>
      <div
        className="bool-bar"
        role="group"
        aria-label="Boolean operations"
        onMouseLeave={() => clearBooleanPreview()}
      >
        {BOOLEAN_ACTIONS.map((action) => {
          const disabled = selectionCount < 2;
          return (
            <button
              key={action.op}
              type="button"
              className="ops-text"
              title={disabled ? BOOLEAN_DISABLED : action.title}
              disabled={disabled}
              onMouseEnter={() => {
                if (!disabled) void previewBooleanOp(action.op);
              }}
              onFocus={() => {
                if (!disabled) void previewBooleanOp(action.op);
              }}
              onClick={() => void onBoolean(action.op)}
            >
              {action.label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="ops-text ops-text--wide"
        title={shapeBuilderActive ? "Commit Shape Builder regions" : SHAPE_BUILDER_DISABLED}
        disabled={!shapeBuilderActive}
        onClick={() => {
          void commitShapeBuilder().then(() => onNotify("Shape builder committed", "success"));
        }}
      >
        Commit Shape Builder
      </button>
      <style>{`
        .ops-bar { display: grid; gap: 0.35rem; }
        .ops-label {
          font-size: 0.68rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--fg-1);
        }
        .align-bar, .bool-bar {
          display: grid;
          gap: 0.25rem;
        }
        .align-bar { grid-template-columns: repeat(auto-fit, minmax(2rem, 1fr)); }
        .bool-bar { grid-template-columns: repeat(auto-fit, minmax(4.5rem, 1fr)); }
        .ops-icon, .ops-text {
          border: 1px solid var(--border);
          background: transparent;
          border-radius: 8px;
          color: var(--fg-0);
        }
        .ops-icon {
          height: 32px;
          display: grid;
          place-items: center;
          padding: 0;
        }
        .ops-icon svg { width: 16px; height: 16px; }
        .ops-text {
          padding: 0.35rem 0.2rem;
          font-size: 0.72rem;
        }
        .ops-text--wide { width: 100%; }
        .ops-icon:hover:not(:disabled), .ops-text:hover:not(:disabled) {
          border-color: rgba(184,255,60,0.35);
        }
        .ops-icon:disabled, .ops-text:disabled {
          color: var(--fg-disabled);
          opacity: var(--disabled-opacity);
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
