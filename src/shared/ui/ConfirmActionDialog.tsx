import { useEffect, useSyncExternalStore } from "react";
import { Button } from "./Button";
import { getConfirmAction, resolveConfirmAction, subscribeConfirmAction } from "./confirmAction";

export function ConfirmActionDialog() {
  const pending = useSyncExternalStore(subscribeConfirmAction, getConfirmAction, getConfirmAction);

  useEffect(() => {
    if (!pending) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      resolveConfirmAction(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pending]);

  if (!pending) return null;

  return (
    <div className="sv-confirm" role="presentation">
      <div role="alertdialog" aria-modal="true" aria-labelledby="sv-confirm-title" className="sv-confirm__card">
        <h2 id="sv-confirm-title">{pending.title}</h2>
        <p>{pending.message}</p>
        <div className="sv-confirm__actions">
          <Button variant="danger" data-action="confirm" onClick={() => resolveConfirmAction(true)}>
            Continue
          </Button>
          <Button autoFocus data-action="cancel" onClick={() => resolveConfirmAction(false)}>
            Cancel
          </Button>
        </div>
      </div>
      <style>{`
        .sv-confirm {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: grid;
          place-items: center;
          background: rgba(10, 12, 16, 0.62);
        }
        .sv-confirm__card {
          width: min(28rem, calc(100vw - 2rem));
          display: grid;
          gap: 0.75rem;
          padding: 1.1rem 1.15rem 1rem;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          background: var(--bg-1);
          color: var(--fg-0);
        }
        .sv-confirm__card h2 { margin: 0; font-size: 1rem; }
        .sv-confirm__card p { margin: 0; color: var(--fg-1); }
        .sv-confirm__actions { display: flex; justify-content: flex-end; gap: 0.45rem; }
      `}</style>
    </div>
  );
}
