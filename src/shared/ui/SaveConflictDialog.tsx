import { useEffect, useSyncExternalStore } from "react";
import { Button } from "./Button";
import {
  getSaveConflictPrompt,
  resolveSaveConflictPrompt,
  subscribeSaveConflictPrompt,
} from "./saveConflictPrompt";

export function SaveConflictDialog() {
  const pending = useSyncExternalStore(
    subscribeSaveConflictPrompt,
    getSaveConflictPrompt,
    getSaveConflictPrompt,
  );

  useEffect(() => {
    if (!pending) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      resolveSaveConflictPrompt("cancel");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pending]);

  if (!pending) return null;

  return (
    <div className="sv-unsaved" role="presentation">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sv-conflict-title"
        className="sv-unsaved__card"
      >
        <h2 id="sv-conflict-title">File changed on disk</h2>
        <p>{pending.question}</p>
        <div className="sv-unsaved__actions">
          <Button
            variant="primary"
            autoFocus
            data-action="reload"
            onClick={() => resolveSaveConflictPrompt("reload")}
          >
            Reload
          </Button>
          <Button data-action="saveAs" onClick={() => resolveSaveConflictPrompt("saveAs")}>
            Save As…
          </Button>
          <Button
            variant="danger"
            data-action="overwrite"
            onClick={() => resolveSaveConflictPrompt("overwrite")}
          >
            Overwrite
          </Button>
          <Button data-action="cancel" onClick={() => resolveSaveConflictPrompt("cancel")}>
            Cancel
          </Button>
        </div>
      </div>
      <style>{`
        .sv-unsaved {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: grid;
          place-items: center;
          background: rgba(10, 12, 16, 0.62);
        }
        .sv-unsaved__card {
          width: min(28rem, calc(100vw - 2rem));
          padding: 1.1rem 1.15rem 1rem;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          background: var(--bg-1);
          color: var(--fg-0);
        }
        .sv-unsaved__card h2 {
          margin: 0;
          font-size: 1rem;
        }
        .sv-unsaved__card p {
          margin: 0.65rem 0 1rem;
          color: var(--fg-1);
          font-size: var(--text-sm);
        }
        .sv-unsaved__actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 0.5rem;
        }
      `}</style>
    </div>
  );
}
