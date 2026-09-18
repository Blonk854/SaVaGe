import { useEffect, useSyncExternalStore } from "react";
import { Button } from "./Button";
import {
  getUnsavedChangesPrompt,
  resolveUnsavedChangesPrompt,
  subscribeUnsavedChangesPrompt,
} from "./unsavedChangesPrompt";

export function UnsavedChangesDialog() {
  const pending = useSyncExternalStore(
    subscribeUnsavedChangesPrompt,
    getUnsavedChangesPrompt,
    getUnsavedChangesPrompt,
  );

  useEffect(() => {
    if (!pending) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      resolveUnsavedChangesPrompt("cancel");
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
        aria-labelledby="sv-unsaved-title"
        className="sv-unsaved__card"
      >
        <h2 id="sv-unsaved-title">Unsaved changes</h2>
        <p>{pending.question}</p>
        <div className="sv-unsaved__actions">
          <Button
            variant="primary"
            autoFocus
            data-action="save"
            onClick={() => resolveUnsavedChangesPrompt("save")}
          >
            Save
          </Button>
          <Button
            variant="danger"
            data-action="discard"
            onClick={() => resolveUnsavedChangesPrompt("discard")}
          >
            Discard
          </Button>
          <Button data-action="cancel" onClick={() => resolveUnsavedChangesPrompt("cancel")}>
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
